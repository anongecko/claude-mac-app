const {
  app,
  Tray,
  Menu,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  ipcMain,
} = require("electron");
const path = require("path");
const Store = require("electron-store");
const store = new Store();

let tray, claude;

const iconPath = path.join(__dirname, "icon.icns");

function exec(code) {
  claude.webContents.executeJavaScript(code).catch(console.error);
}

function getValue(key) {
  return store.get(key, true);
}

function optimizePage() {
  exec(`
    // Add any Claude-specific optimizations here
    // For example, you might want to hide certain elements or add custom styles
    const style = document.createElement('style');
    style.textContent = \`
      /* Add your custom CSS here */
    \`;
    document.head.appendChild(style);
  `);
}

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.min(1024, Math.round(width * 0.8));
  const winHeight = Math.min(768, Math.round(height * 0.8));

  claude = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 400,
    minHeight: 300,
    frame: true,
    show: false, // Don't show the window until it's ready
    maximizable: true,
    minimizable: true,
    resizable: true,
    center: true,
    alwaysOnTop: getValue("always-on-top"),
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
    },
  });

  claude.loadURL("https://claude.ai").catch(console.error);
  claude.webContents.on("did-finish-load", optimizePage);
  claude.webContents.on("did-navigate", optimizePage);

  // Center the window and show it when ready
  claude.once("ready-to-show", () => {
    claude.show();
    claude.focus();
  });

  // Set up custom menu
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  ipcMain.handle("get-local-storage", (event, key) => {
    return getValue(key);
  });

  ipcMain.on("set-local-storage", (event, key, value) => {
    store.set(key, value);
    if (key === "always-on-top") {
      claude.setAlwaysOnTop(value);
    }
  });

  claude.on("close", (event) => {
    if (app.quitting) {
      claude = null;
    } else {
      event.preventDefault();
      claude.hide();
    }
  });

  // Save window size and position when closing
  claude.on("close", () => {
    const bounds = claude.getBounds();
    store.set("windowBounds", bounds);
  });
};

function toggleWindow() {
  if (claude.isVisible()) {
    claude.hide();
  } else {
    claude.show();
    claude.focus();
  }
}

app
  .whenReady()
  .then(() => {
    tray = new Tray(iconPath);
    tray.setToolTip("Claude Desktop");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show/Hide Window",
        click: toggleWindow,
      },
      {
        label: "Quit Claude",
        click: () => {
          app.quitting = true;
          app.quit();
        },
      },
      {
        label: "About (GitHub)",
        click: () =>
          shell
            .openExternal("https://github.com/yourusername/claude-desktop")
            .catch(console.error),
      },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("click", toggleWindow);

    createWindow();

    globalShortcut.register("Command+C", toggleWindow);

    const dockMenu = Menu.buildFromTemplate([
      {
        label: "Show/Hide Window",
        click: toggleWindow,
      },
    ]);
    app.dock.setMenu(dockMenu);

    // Restore window size and position
    const storedBounds = store.get("windowBounds");
    if (storedBounds) {
      claude.setBounds(storedBounds);
    }
  })
  .catch(console.error);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    claude.show();
  }
});

app.on("before-quit", () => {
  app.quitting = true;
});
