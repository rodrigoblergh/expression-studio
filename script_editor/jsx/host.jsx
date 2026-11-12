/**
 * Compatibility entry point for the Code Editor.
 * Load the shared host at global scope so every CEP call sees the same operations.
 * Also works when this entry point is loaded first or by itself.
 */
$.evalFile($.fileName.replace(/[^\/\\]+$/, "") + "../../jsx/host.jsx");
