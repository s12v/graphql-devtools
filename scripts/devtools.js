chrome.devtools.panels.create(
    "GraphQL",
    "",
    "dist/index.html",
    panel => {
        panel.onShown.addListener(panelWindow => {
            panelWindow.panelCreated(chrome.devtools);
        })
    }
);
