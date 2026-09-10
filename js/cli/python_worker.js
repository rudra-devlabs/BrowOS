/**
 * BrowOS Python 3 Web Worker
 * Runs Pyodide CPython 3 in an isolated background thread.
 * Prevents CPU-intensive scripts and time.sleep() from freezing the BrowOS main thread.
 */

let pyodide = null;
let isReady = false;

// High-precision synchronous sleep on worker thread
function workerSleep(ms) {
    if (typeof SharedArrayBuffer !== 'undefined') {
        try {
            const sab = new SharedArrayBuffer(4);
            const int32 = new Int32Array(sab);
            Atomics.wait(int32, 0, 0, ms);
            return;
        } catch (e) {}
    }
    // Fallback: synchronous loop on worker thread (safe because worker is isolated from UI)
    const start = performance.now();
    while (performance.now() - start < ms) {}
}

async function init() {
    if (isReady) return;
    self.postMessage({ type: 'status', message: '\x1b[36mInitializing Python 3 runtime (Pyodide Web Worker)...\x1b[0m\n' });

    importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');

    pyodide = await self.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
    });

    // Connect stdout & stderr hooks
    self.pyodide_stdout = (str) => {
        self.postMessage({ type: 'stdout', text: str });
    };

    self.pyodide_stderr = (str) => {
        self.postMessage({ type: 'stderr', text: str });
    };

    self.pyodide_sleep = (sec) => {
        workerSleep(Math.max(1, Math.round(sec * 1000)));
    };

    await pyodide.runPythonAsync(`
import sys
import js
import time

class BrowOSWorkerStdout:
    def write(self, s):
        js.pyodide_stdout(s)
    def flush(self):
        pass

class BrowOSWorkerStderr:
    def write(self, s):
        js.pyodide_stderr(s)
    def flush(self):
        pass

sys.stdout = BrowOSWorkerStdout()
sys.stderr = BrowOSWorkerStderr()

def _browos_sleep(s):
    js.pyodide_sleep(float(s))

time.sleep = _browos_sleep
    `);

    isReady = true;
    self.postMessage({ type: 'status', message: '\x1b[32mPython 3.11.3 (Pyodide Worker) ready.\x1b[0m\n' });
    self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
    const { action, id, code, files } = e.data;

    if (action === 'init') {
        try {
            await init();
        } catch (err) {
            self.postMessage({ type: 'error', id, error: err.message });
        }
        return;
    }

    if (action === 'run') {
        try {
            if (!isReady) await init();

            // Sync files into virtual filesystem
            if (files && typeof files === 'object') {
                for (const [fname, content] of Object.entries(files)) {
                    if (content !== null && content !== undefined) {
                        try {
                            pyodide.FS.writeFile(fname, content);
                        } catch (err) {}
                    }
                }
            }

            const result = await pyodide.runPythonAsync(code);
            self.postMessage({ type: 'done', id, result: result !== undefined ? String(result) : undefined });
        } catch (err) {
            self.postMessage({ type: 'error', id, error: err.message });
        }
    }
};
