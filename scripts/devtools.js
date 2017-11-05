chrome.devtools.panels.create(
    "MyGraphQL",
    "",
    "dist/index.html",
    panel => {
        panel.onShown.addListener(panelWindow => {
            panelWindow.panelCreated(chrome.devtools);
        })
    }
);
