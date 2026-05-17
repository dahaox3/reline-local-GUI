from __future__ import annotations

import argparse
import asyncio
import copy
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

import orjson
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from reline import Pipeline
from starlette.background import BackgroundTask

BASE_DIR = Path(__file__).parent.resolve()
CONFIG_PATH = BASE_DIR / 'server_config.json'
TMP_ROOT = BASE_DIR / 'tmp' / 'server'

app = FastAPI(title='Reline Local API')
queue_lock = asyncio.Lock()
status = {
    'state': 'idle',
    'queue_length': 0,
    'current_file': None,
    'current_detected_color': None,
    'last_model_used': None,
    'last_skipped_nodes': [],
}


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


def patch_single_image_config(config: list[dict[str, Any]], input_dir: Path, output_dir: Path, color_detect_mode: str | None) -> list[dict[str, Any]]:
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
        elif node_type == 'upscale' and color_detect_mode:
            options['color_detect_mode'] = color_detect_mode
    return patched


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


def media_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in ('.jpg', '.jpeg'):
        return 'image/jpeg'
    if suffix == '.webp':
        return 'image/webp'
    return 'image/png'


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

            config = patch_single_image_config(load_config(), input_dir, output_dir, color_detect_mode)
            pipeline = Pipeline.from_json(config)
            await asyncio.to_thread(lambda: pipeline.process_linear(with_tqdm=False))
            result = pipeline.last_result
            status['current_detected_color'] = result.get('detected_color')
            status['last_model_used'] = result.get('model_used')
            status['last_skipped_nodes'] = result.get('skipped_nodes') or []
            output_path = find_output_file(output_dir)
            response_path = request_dir / output_path.name
            shutil.copy2(output_path, response_path)
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5678)
    args = parser.parse_args()

    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
