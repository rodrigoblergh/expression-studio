/* User-initiated update discovery. Never downloads or executes an update. */
(function (root) {
    "use strict";
    var CURRENT_VERSION = "1.0.1";
    var REPO_URL = "https://github.com/rodrigoblergh/expression-studio";
    var API_URL = "https://api.github.com/repos/rodrigoblergh/expression-studio/releases/latest";
    function versionParts(value) {
        if (typeof value !== "string" || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid stable version.");
        var parts = value.split(".");
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].length > 9) throw new Error("Invalid stable version.");
            parts[i] = Number(parts[i]);
        }
        return parts;
    }
    function compareVersions(left, right) {
        var a = versionParts(left), b = versionParts(right);
        for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
        return 0;
    }
    function validateRelease(data) {
        if (!data || data.draft !== false || data.prerelease !== false || typeof data.tag_name !== "string") throw new Error("Not a published stable release.");
        var version = data.tag_name.replace(/^v/, "");
        versionParts(version);
        var releaseUrl = REPO_URL + "/releases/tag/" + data.tag_name;
        if (data.html_url !== releaseUrl) throw new Error("Unexpected release address.");
        var assetName = "Expression-Studio-" + version + ".zip";
        var assetUrl = REPO_URL + "/releases/download/" + data.tag_name + "/" + assetName;
        var found = false;
        if (!Array.isArray(data.assets)) throw new Error("Release has no installable package.");
        for (var i = 0; i < data.assets.length; i++) {
            var asset = data.assets[i];
            if (asset && asset.name === assetName && asset.browser_download_url === assetUrl && asset.state === "uploaded" && typeof asset.size === "number" && asset.size > 0) found = true;
        }
        if (!found) throw new Error("Release has no verified package address.");
        return {version:version, releaseUrl:releaseUrl, assetUrl:assetUrl};
    }
    function readResponse(status, text) {
        if (status === 404) return {kind:"unpublished", message:"No public stable release is available yet."};
        if (status === 403 || status === 429) throw new Error("GitHub temporarily limited update checks. Try again later.");
        if (status !== 200) throw new Error("Could not check GitHub (HTTP " + status + "). Try again later.");
        var release = validateRelease(JSON.parse(text));
        release.kind = compareVersions(release.version, CURRENT_VERSION) > 0 ? "update" : "current";
        return release;
    }
    function init() {
        var button = document.getElementById("check-updates"), status = document.getElementById("update-status");
        if (!button || !status) return;
        button.addEventListener("click", function () {
            button.disabled = true;
            status.textContent = "Installed " + CURRENT_VERSION + " · Checking GitHub…";
            var request = new XMLHttpRequest(), finished = false;
            function finish(message, release) {
                if (finished) return;
                finished = true; button.disabled = false; status.textContent = message;
                if (!release) return;
                var link = document.createElement("a");
                link.textContent = " Review release and installation instructions";
                link.href = release.releaseUrl;
                link.addEventListener("click", function (event) {
                    event.preventDefault();
                    try { new CSInterface().openURLInDefaultBrowser(release.releaseUrl); }
                    catch (error) { status.textContent = "Open this release in your browser: " + release.releaseUrl; }
                });
                status.appendChild(link);
            }
            request.onload = function () {
                try {
                    var result = readResponse(request.status, request.responseText);
                    if (result.kind === "unpublished") finish("Installed " + CURRENT_VERSION + " · " + result.message);
                    else if (result.kind === "update") finish("Installed " + CURRENT_VERSION + " · " + result.version + " is available. Installation requires your approval.", result);
                    else finish("Installed " + CURRENT_VERSION + " · Latest stable " + result.version + ". No newer update.");
                } catch (error) { finish("Update check failed: " + error.message); }
            };
            request.onerror = function () { finish("Update check could not connect. Check your connection and try again."); };
            request.ontimeout = function () { finish("Update check timed out. Try again later."); };
            try { request.open("GET", API_URL, true); request.timeout = 15000; request.setRequestHeader("Accept", "application/vnd.github+json"); request.send(); }
            catch (error) { finish("Update check could not start: " + error.message); }
        });
    }
    if (typeof module !== "undefined" && module.exports) module.exports = {currentVersion:CURRENT_VERSION, compareVersions:compareVersions, validateRelease:validateRelease, readResponse:readResponse};
    if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
}(this));
