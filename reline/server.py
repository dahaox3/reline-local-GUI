from __future__ import annotations

import argparse
import asyncio
import copy
import gc
import logging
import os
import shutil
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any

import orjson
import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from reline.nodes import INTERNAL_REGISTRY
from reline.nodes.file_reader import FileReaderNode
from reline.nodes.file_writer import FileWriterNode
from reline.nodes.folder_reader import FolderReaderNode
from reline.nodes.folder_writer import FolderWriterNode
try:
    from reline.nodes.api_output import ApiOutputNode
    from reline.nodes.snapshot_writer import SnapshotWriterNode
except ImportError:
    ApiOutputNode = None
    SnapshotWriterNode = None
from reline.nodes.upscale import UpscaleNode
from reline.nodes.upscale.node import empty_cuda_cache
from reline.static import ImageFile, Node
from starlette.background import BackgroundTask

try:
    from reline.utils import detect_image_color
except ImportError:
    def _to_uint8_rgb(img):
        if img.dtype == np.uint8:
            result = img.copy()
        else:
            result = np.asarray(img)
            if result.size and float(np.nanmax(result)) <= 1.0:
                result = result * 255.0
            result = np.clip(result, 0, 255).astype(np.uint8)

        if result.ndim == 2:
            return np.stack([result, result, result], axis=-1)
        if result.ndim == 3 and result.shape[2] >= 3:
            return result[:, :, :3]
        return np.squeeze(result)

    def detect_image_color(img):
        squeezed = np.squeeze(img)
        if squeezed.ndim == 2:
            return type('ColorDetectionResult', (), {'is_color': False})()
        if squeezed.ndim != 3 or squeezed.shape[2] == 1:
            return type('ColorDetectionResult', (), {'is_color': False})()

        rgb = _to_uint8_rgb(squeezed)
        if rgb.ndim != 3 or rgb.shape[2] < 3:
            return type('ColorDetectionResult', (), {'is_color': False})()

        height, width = rgb.shape[:2]
        scale = 256 / max(height, width)
        if scale < 1:
            rgb = cv2.resize(rgb, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)

        value = rgb.max(axis=2)
        mask = (value >= 10) & (value <= 245)
        if not np.any(mask):
            return type('ColorDetectionResult', (), {'is_color': False})()

        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        saturation = hsv[:, :, 1]
        rgb_diff = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
        saturated_ratio = float(np.mean(saturation[mask] > 30))
        rgb_diff_mean = float(np.mean(rgb_diff[mask]))
        return type('ColorDetectionResult', (), {'is_color': saturated_ratio > 0.05 and rgb_diff_mean > 10})()

BASE_DIR = Path(__file__).parent.resolve()
CONFIG_PATH = BASE_DIR / 'server_config.json'
TMP_ROOT = BASE_DIR / 'tmp' / 'server'
logger = logging.getLogger('reline.server')

app = FastAPI(title='Reline Local API')
queue_lock = asyncio.Lock()
node_lock = asyncio.Lock()
status = {
    'state': 'idle',
    'queue_length': 0,
    'current_file': None,
    'current_detected_color': None,
    'last_model_used': None,
    'last_skipped_nodes': [],
}

cached_config: list[dict[str, Any]] | None = None
cached_upscale_index: int | None = None
upscale_node: UpscaleNode | None = None


class ConfigError(ValueError):
    pass


def normalize_paths(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: normalize_paths(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize_paths(item) for item in obj]
    if isinstance(obj, str):
        try:
            if os.path.exists(obj):
                return str(Path(obj).resolve())
        except UnicodeEncodeError:
            return obj
    return obj


def load_config() -> list[dict[str, Any]]:
    with CONFIG_PATH.open('rb') as file:
        return normalize_paths(orjson.loads(file.read()))


def find_node_index(config: list[dict[str, Any]], node_type: str) -> int | None:
    for i, node in enumerate(config):
        if node.get('type') == node_type:
            return i
    return None


def validate_server_config(config: list[dict[str, Any]]) -> int:
    reader_index = find_node_index(config, 'folder_reader')
    writer_index = find_node_index(config, 'folder_writer')
    upscale_indexes = [i for i, node in enumerate(config) if node.get('type') == 'upscale']
    api_output_indexes = [i for i, node in enumerate(config) if node.get('type') == 'api_output']
    if reader_index is None:
        raise ConfigError('Server config requires a folder_reader node')
    if writer_index is None and not api_output_indexes:
        raise ConfigError('Server config requires a folder_writer node or an api_output node')
    if not upscale_indexes:
        raise ConfigError('Server config requires an upscale node')
    if len(upscale_indexes) > 1:
        raise ConfigError('Server mode does not support multiple upscale nodes')
    if len(api_output_indexes) > 1:
        raise ConfigError('Server mode does not support multiple api_output nodes')
    upscale_index = upscale_indexes[0]
    if not reader_index < upscale_index:
        raise ConfigError('Server config requires folder_reader before upscale')
    if writer_index is not None and not reader_index < upscale_index < writer_index:
        raise ConfigError('Server config requires folder_reader -> upscale -> folder_writer order')
    for index in api_output_indexes:
        if index <= reader_index:
            raise ConfigError('api_output must be after folder_reader')
    for index, node in enumerate(config):
        if node.get('type') == 'snapshot_writer' and index <= reader_index:
            raise ConfigError('snapshot_writer must be after folder_reader')
    if writer_index is not None and writer_index < len(config) - 1:
        logger.warning('folder_writer is before later nodes; server mode will run those nodes before writing output')
    return upscale_index


def folder_writer_api_output_path(config: list[dict[str, Any]]) -> Path | None:
    for node in config:
        if node.get('type') != 'folder_writer':
            continue
        api_output_path = (node.get('options') or {}).get('api_output_path')
        if api_output_path:
            return Path(api_output_path)
    return None


def patch_request_config(
    config: list[dict[str, Any]],
    input_dir: Path,
    output_dir: Path,
    color_detect_mode: str | None,
) -> list[dict[str, Any]]:
    patched = copy.deepcopy(config)
    for node in patched:
        node_type = node.get('type')
        options = node.get('options', {})
        if node_type == 'folder_reader':
            options['path'] = str(input_dir)
            options['recursive'] = False
            if options.get('mode') == 'gray':
                options['mode'] = 'dynamic'
        elif node_type == 'folder_writer':
            options['path'] = str(output_dir)
        elif node_type == 'upscale':
            options['model_cache_mode'] = 'high_memory'
            if color_detect_mode:
                options['color_detect_mode'] = color_detect_mode
    return patched


def create_node(node_data: dict[str, Any]) -> Node:
    node_type = node_data['type']
    if node_type in {'snapshot_writer', 'api_output'} and node_type not in INTERNAL_REGISTRY:
        raise ConfigError(f'{node_type} requires updating the reline package')
    node_pair = INTERNAL_REGISTRY.get(node_type)
    options_data = dict(node_data['options'])
    if node_type == 'folder_writer':
        options_data.pop('api_output_path', None)
    options = node_pair.options(**options_data)
    return node_pair.node(options)


def clone_image_file(file: ImageFile) -> ImageFile:
    return ImageFile(
        file.data.copy(),
        file.basename,
        file.dir,
        file.is_color,
        file.skipped_nodes.copy(),
    )


def save_snapshot_file(file: ImageFile, node_data: dict[str, Any]) -> None:
    if SnapshotWriterNode is not None and 'snapshot_writer' in INTERNAL_REGISTRY:
        node = create_node(node_data)
        node.api_process(file)
        return
    raise ConfigError('snapshot_writer requires updating the reline package')


def create_upscale_node(config: list[dict[str, Any]], upscale_index: int) -> UpscaleNode:
    node_data = copy.deepcopy(config[upscale_index])
    node_data['options']['model_cache_mode'] = 'high_memory'
    node = create_node(node_data)
    if not isinstance(node, UpscaleNode):
        raise ConfigError('Configured upscale node did not create an UpscaleNode')
    return node


def dispose_upscale_node() -> None:
    global upscale_node
    node = upscale_node
    upscale_node = None
    if node is None:
        return
    try:
        if getattr(node, 'model', None) is not None:
            del node.model
            node.model = None
        if getattr(node, 'model_cache', None) is not None:
            node.model_cache.clear()
    finally:
        gc.collect()
        empty_cuda_cache()


def reload_config_state() -> dict[str, Any]:
    global cached_config, cached_upscale_index
    dispose_upscale_node()
    config = load_config()
    upscale_index = validate_server_config(config)
    cached_config = config
    cached_upscale_index = upscale_index
    return {'reloaded': True, 'models': model_names_from_config(config)}


def ensure_config_state() -> tuple[list[dict[str, Any]], int]:
    global cached_config, cached_upscale_index
    if cached_config is None or cached_upscale_index is None:
        config = load_config()
        cached_upscale_index = validate_server_config(config)
        cached_config = config
    return cached_config, cached_upscale_index


def ensure_upscale_node(config: list[dict[str, Any]], upscale_index: int) -> UpscaleNode:
    global upscale_node
    if upscale_node is None:
        upscale_node = create_upscale_node(config, upscale_index)
    return upscale_node


def model_names_from_config(config: list[dict[str, Any]]) -> list[str]:
    models = []
    for node in config:
        if node.get('type') != 'upscale':
            continue
        options = node.get('options', {})
        for key in ('model', 'gray_model', 'color_model'):
            model = options.get(key)
            if model:
                models.append(Path(model).name)
    return sorted(set(models))


def find_output_file(output_dir: Path) -> Path:
    files = [path for path in output_dir.rglob('*') if path.is_file()]
    if not files:
        raise FileNotFoundError('Pipeline did not produce an output image')
    return max(files, key=lambda path: path.stat().st_mtime)


def copy_api_output_file(source_path: Path, config: list[dict[str, Any]]) -> None:
    api_output_path = folder_writer_api_output_path(config)
    if api_output_path is None:
        return
    api_output_path.mkdir(parents=True, exist_ok=True)
    target = api_output_path / source_path.name
    if target.exists():
        stem = source_path.stem
        suffix = source_path.suffix
        counter = 1
        while target.exists():
            target = api_output_path / f'{stem}_{counter}{suffix}'
            counter += 1
    shutil.copy2(source_path, target)


def media_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in ('.jpg', '.jpeg'):
        return 'image/jpeg'
    if suffix == '.webp':
        return 'image/webp'
    return 'image/png'


def collect_result(img: ImageFile | None, node: UpscaleNode) -> dict[str, Any]:
    result = {
        'detected_color': None,
        'model_used': getattr(node, 'last_model_path', None),
        'skipped_nodes': [],
    }
    if img is not None:
        result['detected_color'] = 'color' if img.is_color else 'gray' if img.is_color is not None else None
        result['skipped_nodes'] = img.skipped_nodes
    return result


def write_output_image(
    img: ImageFile,
    writer_node: FolderWriterNode | FileWriterNode | None,
    output_dir: Path,
) -> Path:
    if writer_node is None:
        writer_node = create_node({
            'type': 'folder_writer',
            'options': {
                'path': str(output_dir),
                'format': 'png',
            },
        })
    before = set(output_dir.rglob('*'))
    writer_node.single_process(img)
    files = [path for path in output_dir.rglob('*') if path.is_file() and path not in before]
    if files:
        return max(files, key=lambda path: path.stat().st_mtime)
    return find_output_file(output_dir)


def run_single_image(
    config: list[dict[str, Any]],
    upscale_index: int,
    input_dir: Path,
    output_dir: Path,
    color_detect_mode: str | None,
) -> dict[str, Any]:
    request_config = patch_request_config(config, input_dir, output_dir, color_detect_mode)
    node = ensure_upscale_node(config, upscale_index)
    old_upscale_options = node.options
    if color_detect_mode:
        node.update_options(replace(node.options, color_detect_mode=color_detect_mode))
    img: ImageFile | None = None
    api_output_img: ImageFile | None = None
    writer_node: FolderWriterNode | FileWriterNode | None = None

    try:
        for i, node_data in enumerate(request_config):
            node_type = node_data.get('type')
            if i == upscale_index:
                if img is None:
                    raise ConfigError('Upscale node did not receive an image')
                img = node.single_process(img)
                if img is None:
                    raise RuntimeError('Upscale node skipped the image')
                continue

            if node_type == 'api_output':
                if img is None:
                    raise ConfigError('api_output node did not receive an image')
                api_output_img = clone_image_file(img)
                continue

            if node_type == 'snapshot_writer':
                if img is None:
                    raise ConfigError('snapshot_writer node did not receive an image')
                save_snapshot_file(img, node_data)
                continue

            runtime_node = create_node(node_data)
            if isinstance(runtime_node, FolderReaderNode | FileReaderNode):
                data = runtime_node.single_process([])
                img = next(iter(data), None) if not isinstance(data, ImageFile) else data
                if img is None:
                    raise FileNotFoundError('Reader did not produce an input image')
                if img.is_color is None:
                    img.is_color = detect_image_color(img.data).is_color
            elif isinstance(runtime_node, FolderWriterNode | FileWriterNode):
                writer_node = runtime_node
            else:
                if img is None:
                    raise ConfigError(f'{node_type} node did not receive an image')
                img = runtime_node.single_process(img)
                if img is None:
                    raise RuntimeError(f'{node_type} node skipped the image')

        output_img = api_output_img if api_output_img is not None else img
        if output_img is None:
            raise ConfigError('Writer node did not receive an image')
        output_path = write_output_image(output_img, writer_node, output_dir)
        result = collect_result(img, node)
        result['output_path'] = str(output_path)
        return result
    finally:
        if node.options is not old_upscale_options:
            node.update_options(old_upscale_options)


@app.get('/status')
async def get_status():
    return JSONResponse(status)


@app.get('/models')
async def get_models():
    try:
        config = load_config()
    except Exception as e:
        return JSONResponse({'models': [], 'error': str(e)}, status_code=500)
    return {'models': model_names_from_config(config)}


@app.post('/reload')
async def reload_server_config():
    async with node_lock:
        try:
            return reload_config_state()
        except Exception as e:
            return JSONResponse({'reloaded': False, 'error': str(e)}, status_code=500)


@app.post('/upscale')
async def upscale(file: UploadFile = File(...), color_detect_mode: str | None = Form(None)):
    status['queue_length'] += 1
    async with queue_lock:
        status['queue_length'] -= 1
        status['state'] = 'processing'
        status['current_file'] = file.filename
        status['current_detected_color'] = None

        request_id = uuid.uuid4().hex
        request_dir = TMP_ROOT / request_id
        input_dir = request_dir / 'input'
        output_dir = request_dir / 'output'
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            input_path = input_dir / (Path(file.filename or 'input.png').name)
            with input_path.open('wb') as out:
                shutil.copyfileobj(file.file, out)

            async with node_lock:
                config, upscale_index = ensure_config_state()
                result = await asyncio.to_thread(
                    run_single_image,
                    config,
                    upscale_index,
                    input_dir,
                    output_dir,
                    color_detect_mode,
                )
            status['current_detected_color'] = result.get('detected_color')
            status['last_model_used'] = result.get('model_used')
            status['last_skipped_nodes'] = result.get('skipped_nodes') or []
            output_path = Path(result['output_path'])
            response_path = request_dir / output_path.name
            shutil.copy2(output_path, response_path)
            copy_api_output_file(output_path, config)
            return FileResponse(
                response_path,
                media_type=media_type_for(response_path),
                filename=response_path.name,
                headers={
                    'X-Reline-Detected-Color': status['current_detected_color'] or 'unknown',
                    'X-Reline-Model-Used': Path(status['last_model_used']).name if status['last_model_used'] else '',
                    'X-Reline-Skipped-Nodes': ','.join(status['last_skipped_nodes']),
                },
                background=BackgroundTask(lambda: shutil.rmtree(request_dir, ignore_errors=True)),
            )
        except Exception as e:
            return JSONResponse({'error': str(e)}, status_code=500)
        finally:
            status['state'] = 'idle'
            status['current_file'] = None
            status['current_detected_color'] = None
            status['last_model_used'] = None
            status['last_skipped_nodes'] = []
            try:
                if 'response_path' not in locals():
                    shutil.rmtree(request_dir, ignore_errors=True)
            except Exception:
                pass


@app.on_event('shutdown')
def on_shutdown():
    dispose_upscale_node()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5678)
    args = parser.parse_args()

    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
