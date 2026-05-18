const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync } = require("child_process");
const http = require("http");
const https = require("https");

const isDev = !app.isPackaged;

// ==== Paths & Constants ====
const relineDir = path.join(__dirname, "reline");
const uvBinDir = path.join(relineDir, "uv");
const uvBinaryPath = path.join(uvBinDir, os.platform() === "win32" ? "uv.exe" : "uv");
const relineForkRepo = "https://github.com/dahaox3/reline.git";
const relineForkBranch = "main";
const relineForkPackage = `git+${relineForkRepo}`;

let currentChild = null;
let manuallyStopped = false;
let serverChild = null;
let serverPort = 5678;
let serverHost = "127.0.0.1";

// ==== Helpers ====
function sanitizeRelineConfig(jsonData) {
    return jsonData.flatMap((node) => {
        if (node?.type === "snapshot_writer" || node?.type === "api_output") return [];
        if (node?.type !== "folder_writer") return node;
        const options = { ...(node.options || {}) };
        delete options.api_output_path;
        return { ...node, options };
    });
}

function defaultServerReaderNode() {
    return {
        type: "folder_reader",
        options: {
            path: path.join(os.tmpdir(), "reline-server-input"),
            recursive: false,
            mode: "dynamic",
        },
    };
}

function normalizeRelineServerConfig(jsonData) {
    if (!Array.isArray(jsonData)) {
        throw new Error("Reline server config must be a JSON array");
    }

    const config = jsonData.map((node) => ({
        ...node,
        options: { ...(node?.options || {}) },
    }));

    if (!config.some((node) => node?.type === "folder_reader")) {
        config.unshift(defaultServerReaderNode());
    }

    return config;
}

function getRelineServerConfigPath() {
    return path.join(relineDir, "server_config.json");
}

function writeRelineServerConfig(jsonData) {
    fs.writeFileSync(getRelineServerConfigPath(), JSON.stringify(normalizeRelineServerConfig(jsonData), null, 2));
}

function restoreRelineServerConfig(previousContent) {
    const configPath = getRelineServerConfigPath();
    if (previousContent === null) {
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
        return;
    }
    fs.writeFileSync(configPath, previousContent);
}

async function postRelineServerReload() {
    const body = await new Promise((resolve, reject) => {
        const request = http.request({
            host: serverHost,
            port: serverPort,
            path: "/reload",
            method: "POST",
            timeout: 10000,
        }, (response) => {
            let data = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                data += chunk;
            });
            response.on("end", () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(data || `Reline API reload failed with ${response.statusCode}`));
                    return;
                }
                resolve(data);
            });
        });
        request.on("timeout", () => {
            request.destroy(new Error("Reline API reload timed out"));
        });
        request.on("error", reject);
        request.end();
    });
    return body ? JSON.parse(body) : { reloaded: true };
}

function runCommand(command, args = [], options = {}, onData = () => {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { shell: false, ...options });
        let output = "";
        child.stdout.on("data", (data) => {
            output += data.toString();
            onData(data.toString());
        });
        child.stderr.on("data", (data) => {
            output += data.toString();
            onData(data.toString());
        });
        child.on("close", (code) => {
            if (code === 0) resolve(output);
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

function requestText(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                "User-Agent": "reline-local-gui",
            },
        }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                body += chunk;
            });
            response.on("end", () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(body || `Request failed with ${response.statusCode}`));
                    return;
                }
                resolve(body);
            });
        });
        request.on("error", reject);
        request.end();
    });
}

function parseRelineGitCommit(freezeOutput) {
    const line = freezeOutput
        .split(/\r?\n/)
        .find((item) => item.startsWith("reline @ git+"));
    return line?.match(/@([0-9a-f]{40})(?:\s|$)/i)?.[1]?.toLowerCase() || null;
}

async function checkRelineGitUpdate() {
    const freezeOutput = await runCommand(uvBinaryPath, ["pip", "freeze"], { cwd: relineDir });
    const installedCommit = parseRelineGitCommit(freezeOutput);
    if (!installedCommit) return false;

    const refs = await requestText(`${relineForkRepo}/info/refs?service=git-upload-pack`);
    const latestCommit = refs
        .match(new RegExp(`([0-9a-f]{40})\\s+refs/heads/${relineForkBranch}`, "i"))?.[1]
        ?.toLowerCase();
    if (!latestCommit) return false;

    return installedCommit !== latestCommit;
}

function getPlatformName() {
    const platform = os.platform();
    if (platform === "win32") return "win";
    if (platform === "darwin") return "mac";
    if (platform === "linux") return "linux";
    throw new Error(`Unsupported platform: ${platform}`);
}

async function decomp(filename, tempPath, conditions){
    let extractDir = null;
    try{
        const decompress = await import("@xhmikosr/decompress");
        const decompressTarxz = await import("@felipecrs/decompress-tarxz");
        const decompressZip = await import("@xhmikosr/decompress-unzip");
        const decompressTargz = await import("@xhmikosr/decompress-targz");

        console.log(`Starting extraction of ${filename} to ${tempPath}`);
        extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });

        const plugins = [];
        if (filename.endsWith(".tar.xz")) {
            plugins.push(decompressTarxz.default());
        } else if (filename.endsWith(".zip")) {
            plugins.push(decompressZip.default());
        } else if (filename.endsWith(".tar.gz")) {
            plugins.push(decompressTargz.default());
        } else {
            throw new Error("Unsupported archive format");
        }

        const files = await decompress.default(tempPath, extractDir, {
            plugins,
            filter: (file) => conditions(file),
        });
        console.log(`Extracted files: ${files.map(f => f.path).join(", ") || "none"}`);
        return {files, extractDir};
    }
    catch(error) {
        console.error(error);
        if (extractDir && fs.existsSync(extractDir)) {
            try {
                fs.rmSync(extractDir, { recursive: true, force: true });
            } catch (rmErr) {
                console.error(`Failed to delete extract dir ${extractDir}:`, rmErr);
            }
        }
        return {files: null, extractDir: null, error};
    }

}


async function ensureUVBinary() {
    if (fs.existsSync(uvBinaryPath)) {
        console.log("UV binary already exists at", uvBinaryPath);
        return true;
    }

    const platformName = getPlatformName();
    if (platformName === "mac") {
        throw new Error("macOS is not supported");
    }

    const filename = platformName === "win" ? "uv-x86_64-pc-windows-msvc.zip" : "uv-x86_64-unknown-linux-gnu.tar.gz";
    const targetDir = uvBinDir;
    let url = platformName === "win" ? "https://github.com/astral-sh/uv/releases/download/0.8.14/uv-x86_64-pc-windows-msvc.zip" : "https://github.com/astral-sh/uv/releases/download/0.8.14/uv-x86_64-unknown-linux-gnu.tar.gz";

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const tempPath = path.join(os.tmpdir(), filename);

    async function downloadWithRedirect(currentUrl, redirectCount = 0, maxRedirects = 5) {
        if (redirectCount > maxRedirects) {
            throw new Error("Too many redirects");
        }

        console.log(`Downloading ${filename} from ${currentUrl}`);
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(tempPath);
            https.get(currentUrl, (res) => {
                if ([301, 302, 307, 308].includes(res.statusCode)) {
                    file.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    const redirectUrl = res.headers.location;
                    if (!redirectUrl) {
                        return reject(new Error(`Redirect ${res.statusCode} without location header`));
                    }
                    console.log(`Redirecting to ${redirectUrl}`);
                    return downloadWithRedirect(redirectUrl, redirectCount + 1, maxRedirects)
                        .then(resolve)
                        .catch(reject);
                }

                if (res.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    return reject(new Error(`Failed to download UV binaries: HTTP ${res.statusCode}`));
                }

                res.pipe(file);

                file.on("finish", () => {
                    file.close();
                    const stats = fs.statSync(tempPath);
                    if (stats.size === 0) {
                        fs.unlinkSync(tempPath);
                        return reject(new Error("Downloaded file is empty"));
                    }
                    resolve();
                });

                res.on("error", (err) => {
                    file.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    reject(err);
                });
            }).on("error", (err) => {
                file.close();
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                reject(err);
            });
        });
    }

    try {
        await downloadWithRedirect(url);
        console.log(`Downloaded ${filename} to ${tempPath}`);

        const uvExt = filename.endsWith(".tar.gz") ? "uv" : "uv.exe";
        const { files, extractDir, error } = await decomp(filename, tempPath, (file) => file.path === uvExt);
        if (!files || !extractDir) throw new Error(`Failed to decompress: ${error || "Unknown error"}`);

        const targetPath = path.join(targetDir, uvExt);
        const sourcePath = path.join(extractDir, uvExt);

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Extracted file ${sourcePath} does not exist`);
        }

        console.log(`Moving ${sourcePath} to ${targetPath}`);
        fs.copyFileSync(sourcePath, targetPath);
        if (platformName !== "win") fs.chmodSync(targetPath, 0o755);
        fs.unlinkSync(sourcePath);
        fs.rmSync(extractDir, { recursive: true, force: true });
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        console.log("UV binary successfully installed at", targetPath);
        return true;
    } catch (err) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        console.error(`Error processing ${filename}:`, err);
        throw err;
    }
}

function hasNvidiaGPU() {

    try {
        if (os.platform() === "win32") {
            try {
                const out = execSync("wmic path win32_VideoController get name").toString();
                return out.toLowerCase().includes("nvidia");
            } catch {
                const psCommand = 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name';
                const out = execSync(`powershell -NoProfile -Command "${psCommand}"`).toString();
                return out.toLowerCase().includes("nvidia");
            }
        } else if (os.platform() === "linux") {
            const out = execSync("lspci").toString();
            return out.toLowerCase().includes("nvidia");
        } else if (os.platform() === "darwin") {
            return false;
        }
    } catch {
        return false;
    }

    return false;
}


function getDirectorySize(dirPath) {
    let total = 0;
    const walk = (dir) => {
        fs.readdirSync(dir).forEach((f) => {
            const fullPath = path.join(dir, f);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) walk(fullPath);
            else total += stat.size;
        });
    };
    walk(dirPath);
    return total;
}

// ==== Create Window ====
const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        resizable: true,
        title: "Reline GUI",
        icon: path.join(__dirname, "public",  "favicon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    Menu.setApplicationMenu(null);

    if (isDev) win.loadURL("http://localhost:5173");
    else win.loadFile("./dist/index.html");
};

// ==== IPC Handlers ====

// UV Management
ipcMain.handle("check-dependencies", () => ({
    uv: fs.existsSync(uvBinaryPath),
    venv: fs.existsSync(path.join(relineDir, ".venv")),
}));

ipcMain.handle("clear-uv-cache", async () => {
    await runCommand(uvBinaryPath, ["cache", "clean"]);
});

ipcMain.handle("check-uv-cache", async () => {
    try {
        let cacheDir = "";
        await runCommand(uvBinaryPath, ["cache", "dir"], {}, (data) => {
            cacheDir += data;
        });
        return fs.existsSync(cacheDir.trim());
    } catch {
        return false;
    }
});

ipcMain.handle("check-uv-pip-freeze", async (event) => {
    try {
        const venvPath = path.join(relineDir, ".venv");
        if (!fs.existsSync(venvPath)) {
            return { packages: [], error: "Virtual environment not found." };
        }
        const output = await runCommand(uvBinaryPath, ["pip", "freeze"], { cwd: relineDir });
        const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const packages = cleanOutput
            .split("\n")
            .filter(line => line.trim() && !line.startsWith("#"))
            .map(line => {
                const [name, version] = line.split("==");
                return { name: name?.trim() || "unknown", version: version?.trim() || "unknown" };
            })
            .filter(pkg => pkg.name !== "unknown");
        return { packages, error: null };
    } catch (err) {
        return { packages: [], error: err.message };
    }
});

ipcMain.handle("check-for-updates", async (event) => {
    try {
        const venvPath = path.join(relineDir, ".venv");
        if (!fs.existsSync(venvPath)) {
            return { updatesAvailable: false };
        }
        let output = "";
        await runCommand(uvBinaryPath, ["pip", "list", "--outdated"], { cwd: relineDir }, (data) => {
            output += data;
        });
        const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const updatesAvailable = cleanOutput
            .split("\n")
            .slice(2)
            .some(line => line.includes("reline") || line.includes("resselt"));
        return { updatesAvailable: updatesAvailable || await checkRelineGitUpdate() };
    } catch (err) {
        if (err.message.includes("ENOTFOUND") || err.message.includes("ETIMEDOUT") || err.message.includes("network")) {
            throw new Error("No internet connection");
        }
        throw err;
    }
});

ipcMain.handle("install-updates", async (event) => {
    const log = (data) => event.sender.send("pipeline-output", data);
    try {
        log("📦 Updating...");
        console.log("Installing:", ["pip", "install", "--upgrade", relineForkPackage, "resselt[cu126]"]);
        await runCommand(uvBinaryPath, [
            "pip", "install", "--upgrade", "--force-reinstall",
            "--index-strategy", "unsafe-best-match",
            "--index-url", "https://pypi.org/simple",
            "--extra-index-url", "https://download.pytorch.org/whl/cu126",
            relineForkPackage, "resselt[cu126]"
        ], { cwd: relineDir }, log);
        log("✅ Updates installed successfully");
    } catch (err) {
        log(`❌ Error updating packages: ${err.message}`);
        throw err;
    }
});

// Venv Management
ipcMain.handle("delete-venv", async () => {
    const venvPath = path.join(relineDir, ".venv");
    if (fs.existsSync(venvPath)) {
        await fs.promises.rm(venvPath, { recursive: true, force: true });
    }
});

ipcMain.handle("get-venv-size", () => {
    const venvPath = path.join(relineDir, ".venv");
    if (!fs.existsSync(venvPath)) return "0 MB";
    return `${(getDirectorySize(venvPath) / (1024 * 1024)).toFixed(1)} MB`;
});

// Dependency Installation
ipcMain.handle("install-dependency", async (event, id) => {
    const log = (data) => event.sender.send("pipeline-output", data);
    try {
        await ensureUVBinary();
        const pipArgs = ["pip", "install"];
        if (id === "python") {
            log("📦 Installing Python 3.12 + venv...");
            await runCommand(uvBinaryPath, ["venv", "--python", "3.12", ".venv"], { cwd: relineDir }, log);
            return;
        }

        if (id === "torch") {
            log("📦 Installing torch (CPU)...");
            await runCommand(uvBinaryPath, [...pipArgs, "torch"], { cwd: relineDir }, log);
            return;
        }

        if (id === "torch-cuda") {
            log("📦 Installing torch (CUDA)...");
            await runCommand(uvBinaryPath, [...pipArgs, "torch", "--index-url", "https://download.pytorch.org/whl/cu126"], { cwd: relineDir }, log);
            return;
        }

        if (id === "reline") {
            log("📦 Installing reline...");
            await runCommand(uvBinaryPath, [...pipArgs, "--upgrade", "--force-reinstall", relineForkPackage], { cwd: relineDir }, log);
            return;
        }

        if (id === "server") {
            log("📦 Installing server dependencies...");
            await runCommand(uvBinaryPath, [...pipArgs, "fastapi", "uvicorn", "python-multipart"], { cwd: relineDir }, log);
            return;
        }

        throw new Error(`Unknown dependency ID: ${id}`);
    } catch (err) {
        event.sender.send("pipeline-output", `❌ ${err.message}`);
        throw err;
    }
});

// GPU Check
ipcMain.handle("check-gpu", () => hasNvidiaGPU());

// Model Management
ipcMain.handle("select-model-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths.length) return null;
    const folderPath = result.filePaths[0];
    const modelFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith(".pth") || f.endsWith(".safetensors"));
    return { folderPath, models: modelFiles };
});

ipcMain.handle("load-models-from-folder", async (event, folderPath) => {
    if (!fs.existsSync(folderPath)) return null;
    const modelFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith(".pth") || f.endsWith(".safetensors"));
    return { folderPath, models: modelFiles };
});

ipcMain.handle("select-model-file", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Model Files", extensions: ["pth", "pt", "safetensors"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

ipcMain.handle("select-folder-path", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

ipcMain.handle("download-model", async (event, { url, filename, targetDir }) => {
    console.log("download-model", url, filename, targetDir);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const tempPath = path.join(os.tmpdir(), filename);
    const file = fs.createWriteStream(tempPath);

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                fs.unlinkSync(tempPath);
                return reject(new Error(`Failed to download ${filename}: HTTP ${res.statusCode}`));
            }

            const total = parseInt(res.headers["content-length"] || "0", 10);
            let downloaded = 0;

            res.pipe(file);

            res.on("data", (chunk) => {
                downloaded += chunk.length;
                const progress = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
                event.sender.send("download-progress", { filename, progress });
            });

            file.on("finish", async () => {
                file.close();
                try {
                    if (filename.endsWith(".tar.xz")) {
                        const conditions = (file) => file.path.endsWith(".pth") || file.path.endsWith(".safetensors")
                        const {files, extractDir, error} = await decomp(filename, tempPath, conditions);
                        if ((files && extractDir)== null) throw new Error(`Failed to decompress: ${error}`)

                        const modelFile = files.find((f) => f.path.endsWith(".pth") || f.path.endsWith(".safetensors"));
                        if (!modelFile) {
                            throw new Error(`No valid model file (.pth or .safetensors) found in archive ${filename}`);
                        }

                        const modelName = filename.replace(".tar.xz", "");
                        const ext = path.extname(modelFile.path);
                        const targetPath = path.join(targetDir, `${modelName}${ext}`);
                        const sourcePath = path.join(extractDir, modelFile.path);

                        if (!fs.existsSync(sourcePath)) {
                            throw new Error(`Extracted file ${sourcePath} does not exist`);
                        }

                        console.log(`Moving ${sourcePath} to ${targetPath}`);
                        fs.copyFileSync(sourcePath, targetPath);
                        fs.unlinkSync(sourcePath);

                        fs.rmSync(extractDir, { recursive: true, force: true });
                        fs.unlinkSync(tempPath);
                    } else if (filename.endsWith(".pth") || filename.endsWith(".safetensors")) {
                        const targetPath = path.join(targetDir, filename);
                        console.log(`Moving ${tempPath} to ${targetPath}`);
                        fs.copyFileSync(tempPath, targetPath);
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    } else {
                        throw new Error(`Unsupported file format: ${filename}`);
                    }
                    resolve(true);
                } catch (err) {
                    console.error(`Error processing ${filename}:`, err);
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    reject(err);
                }
            });
        }).on("error", (err) => {
            console.error(`Error downloading ${filename}:`, err);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            reject(err);
        });
    });
});

ipcMain.handle("delete-model", async (_event, { folderPath, modelName }) => {
    const extensions = [".pth", ".safetensors"];
    let deleted = false;
    for (const ext of extensions) {
        const modelPath = path.join(folderPath, `${modelName}${ext}`);
        if (fs.existsSync(modelPath)) {
            console.log(`Deleting model: ${modelPath}`);
            fs.unlinkSync(modelPath);
            deleted = true;
        }
    }
    if (!deleted) {
        throw new Error(`Model ${modelName} not found in ${folderPath}`);
    }
});

ipcMain.handle("get-models-list", async () => {
    return new Promise((resolve, reject) => {
        let data = '';
        const req = https.get('https://mdb.yor.ovh/v1/files', (res) => {
            if (res.statusCode !== 200) {
                console.error(`Failed to fetch models list: status ${res.statusCode}`);
                reject(new Error(`Failed to fetch models list: status ${res.statusCode}`));
                return;
            }
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const models = JSON.parse(data);
                    const fixedModels = models.map(model => ({
                        filename: model.filename,
                        url: model.url.replace('https:/', 'https://')
                    }));
                    resolve(fixedModels);
                } catch (err) {
                    console.error('Error parsing models JSON:', err);
                    reject(new Error('Failed to parse models list.'));
                }
            });
        });
        req.on('error', (err) => {
            console.error('Error fetching models list:', err);
            if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.message.includes('network')) {
                reject(new Error('No internet connection. Please check your network and try again.'));
            } else {
                reject(err);
            }
        });
        req.end();
    });
});

//JSON
ipcMain.handle("select-json-file", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

ipcMain.handle("load-json-files-from-folder", async (event, folderPath) => {
    if (!fs.existsSync(folderPath)) return null;
    return fs.readdirSync(folderPath).filter((f) => f.endsWith(".json"));
});

ipcMain.handle("read-json-file", async (event, filePath) => {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
});

ipcMain.handle("save-json-file", async (event, filePath, content) => {
    fs.writeFileSync(filePath, content);
});

ipcMain.handle("select-save-json-file", async () => {
    const result = await dialog.showSaveDialog({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
});

// Pipeline
ipcMain.handle("run-python-pipeline", async (event, jsonData) => {
    const tempPath = path.join(relineDir, "data.json");
    fs.writeFileSync(tempPath, JSON.stringify(sanitizeRelineConfig(jsonData), null, 2));

    const venvPath = path.join(relineDir, ".venv");
    const pythonPath = os.platform() === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");
    const scriptPath = path.join(relineDir, "main.py");

    currentChild = spawn(pythonPath, [scriptPath], {
        cwd: relineDir,
        windowsHide: true,
        shell: false,
    });

    currentChild.stdout.on("data", (d) => event.sender.send("pipeline-output", d.toString()));
    currentChild.stderr.on("data", (d) => event.sender.send("pipeline-output", d.toString()));

    currentChild.on("close", (code) => {
        console.log("Pipeline closed, code:", code, "timestamp:", Date.now());
        event.sender.send("pipeline-end", { success: code === 0 || manuallyStopped, interrupted: manuallyStopped });
        currentChild = null;
        manuallyStopped = false;
    });

    return { started: true };
});

ipcMain.handle("stop-python-pipeline", () => {
    if (currentChild) {
        manuallyStopped = true;
        currentChild.kill("SIGTERM");
    }
});

ipcMain.handle("start-reline-server", async (event, { jsonData, host = "127.0.0.1", port = 5678 }) => {
    if (serverChild) {
        return { started: true, host: serverHost, port: serverPort, alreadyRunning: true };
    }

    writeRelineServerConfig(jsonData);

    const venvPath = path.join(relineDir, ".venv");
    const pythonPath = os.platform() === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");
    const scriptPath = path.join(relineDir, "server.py");
    serverHost = String(host || "127.0.0.1");
    serverPort = Number(port) || 5678;

    serverChild = spawn(pythonPath, [scriptPath, "--host", serverHost, "--port", String(serverPort)], {
        cwd: relineDir,
        windowsHide: true,
        shell: false,
    });

    serverChild.stdout.on("data", (d) => event.sender.send("pipeline-output", d.toString()));
    serverChild.stderr.on("data", (d) => event.sender.send("pipeline-output", d.toString()));
    serverChild.on("close", (code) => {
        console.log("Reline server closed, code:", code);
        event.sender.send("reline-server-end", { code });
        serverChild = null;
    });

    return { started: true, host: serverHost, port: serverPort };
});

ipcMain.handle("reload-reline-server", async (_event, { jsonData }) => {
    if (!serverChild) {
        return { reloaded: false, running: false };
    }
    const configPath = getRelineServerConfigPath();
    const previousContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : null;
    writeRelineServerConfig(jsonData);
    try {
        const result = await postRelineServerReload();
        return { reloaded: true, running: true, ...result };
    } catch (error) {
        restoreRelineServerConfig(previousContent);
        throw error;
    }
});

ipcMain.handle("stop-reline-server", () => {
    if (serverChild) {
        serverChild.kill("SIGTERM");
        serverChild = null;
    }
    return { stopped: true };
});

ipcMain.handle("get-reline-server-state", () => ({
    running: !!serverChild,
    host: serverHost,
    port: serverPort,
}));

// Audio
ipcMain.handle("select-audio-file", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

ipcMain.handle("get-default-sound-path", () => {
    const isDev = !app.isPackaged;
    if (isDev) {
        return "/fart.mp3";
    } else {
        return path.join(app.getAppPath(), "dist", "fart.mp3");
    }
});

//Other
ipcMain.handle("open-external", async (_event, url) => {
    await shell.openExternal(url);
});

ipcMain.handle("open-folder", async (_event, folderPath) => {
    await shell.openPath(folderPath);
})

// ==== App Lifecycle ====
app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
