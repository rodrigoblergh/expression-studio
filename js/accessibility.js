/* Shared keyboard and assistive-technology behavior for both CEP views. */
(function () {
    "use strict";
    function init() {
        var stack = [];
        var definitions = [
            ["bulk-modal-overlay", "bulk-modal", "btn-bulk-cancel"],
            ["lib-modal-overlay", "lib-modal", "btn-lib-close"],
            ["custom-confirm-overlay", "custom-confirm-modal", "btn-confirm-cancel"]
        ];
        var dialogs = definitions.map(function (d) {
            return { overlay: document.getElementById(d[0]), dialog: document.getElementById(d[1]),
                cancel: document.getElementById(d[2]), wasOpen: false, opener: null };
        }).filter(function (d) { return d.overlay && d.dialog; });
        function visible(el) { return !!el && !!el.getClientRects().length && getComputedStyle(el).visibility !== "hidden"; }
        function focusables(dialog) {
            return Array.prototype.filter.call(dialog.querySelectorAll("button,input,select,textarea,a[href],[tabindex]"), function (el) {
                return !el.disabled && el.tabIndex >= 0 && visible(el);
            });
        }
        function focusDialog(d) {
            var controls = focusables(d.dialog);
            // Confirmation dialogs start on Cancel, never on the destructive action.
            var preferred = d.dialog.id === "custom-confirm-modal" ? d.cancel : controls[0];
            (preferred || d.dialog).focus();
        }
        function refreshEditors(root) {
            Array.prototype.forEach.call(root.querySelectorAll(".CodeMirror"), function (el) {
                if (el.CodeMirror) {
                    var input = el.CodeMirror.getInputField && el.CodeMirror.getInputField();
                    if (input) input.setAttribute("aria-label", el.closest("#lib-modal") ? "Snippet code" : "Expression or script code");
                    if (el.getClientRects().length) el.CodeMirror.refresh();
                }
            });
        }
        function syncDialogs() {
            dialogs.forEach(function (d) {
                var open = !d.overlay.classList.contains("hidden") &&
                    (d.overlay.id === "custom-confirm-overlay" || d.overlay.classList.contains("open"));
                if (open === d.wasOpen) return;
                d.wasOpen = open;
                d.overlay.setAttribute("aria-hidden", open ? "false" : "true");
                if (open) {
                    d.opener = document.activeElement;
                    stack.push(d);
                    refreshEditors(d.dialog);
                    focusDialog(d);
                } else {
                    var wasTop = stack[stack.length - 1] === d;
                    stack = stack.filter(function (entry) { return entry !== d; });
                    if (wasTop) {
                        if (d.opener && document.documentElement.contains(d.opener) && visible(d.opener)) d.opener.focus();
                        else if (stack.length) focusDialog(stack[stack.length - 1]);
                    }
                }
            });
        }
        dialogs.forEach(function (d) {
            new MutationObserver(syncDialogs).observe(d.overlay, {attributes: true, attributeFilter: ["class"]});
        });
        document.addEventListener("keydown", function (e) {
            syncDialogs();
            var d = stack[stack.length - 1];
            if (!d) return;
            if (e.key === "Escape") {
                e.preventDefault(); e.stopImmediatePropagation();
                if (d.cancel) d.cancel.click();
            } else if (e.key === "Tab") {
                var controls = focusables(d.dialog);
                var first = controls[0], last = controls[controls.length - 1];
                if (!first) { e.preventDefault(); d.dialog.focus(); }
                else if (!d.dialog.contains(document.activeElement) ||
                    (e.shiftKey && document.activeElement === first) ||
                    (!e.shiftKey && document.activeElement === last)) {
                    e.preventDefault(); (e.shiftKey ? last : first).focus();
                }
            }
        }, true);
        document.addEventListener("focusin", function (e) {
            var d = stack[stack.length - 1];
            if (d && !d.dialog.contains(e.target)) focusDialog(d);
        });
        var tabs = Array.prototype.slice.call(document.querySelectorAll(".master-tab"));
        function selectTab(tab) {
            tabs.forEach(function (item) {
                var selected = item === tab;
                item.classList.toggle("active", selected);
                item.setAttribute("aria-selected", String(selected));
                item.tabIndex = selected ? 0 : -1;
                var panel = document.getElementById(item.getAttribute("data-target"));
                panel.classList.toggle("active", selected);
                panel.setAttribute("aria-hidden", String(!selected));
                if (selected) {
                    refreshEditors(panel);
                    var frame = panel.querySelector("iframe");
                    if (frame) {
                        try { if (frame.contentDocument) refreshEditors(frame.contentDocument); } catch (e) {}
                    }
                }
            });
        }
        tabs.forEach(function (tab, index) {
            tab.addEventListener("click", function () { selectTab(tab); });
            tab.addEventListener("keydown", function (e) {
                var next = index;
                if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (e.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = tabs.length - 1;
                else return;
                e.preventDefault(); tabs[next].focus(); selectTab(tabs[next]);
            });
        });
        var filter = document.getElementById("prop-filter-header"), filterBody = document.getElementById("prop-filter-body");
        if (filter && filterBody) {
            filter.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); filter.click(); }
            });
            new MutationObserver(function () {
                filter.setAttribute("aria-expanded", String(!filterBody.classList.contains("hidden")));
            }).observe(filterBody, {attributes: true, attributeFilter: ["class"]});
        }
        refreshEditors(document);
        syncDialogs();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
