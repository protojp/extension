Title: window | Plugin API

URL Source: https://developer.eagle.cool/plugin-api/api/window

Markdown Content:
1.   [API Reference](https://developer.eagle.cool/plugin-api/api)

window
------

Control operations for plugin window display, hide, fullscreen, etc.

Below are common examples of `window` functionalities:

```
await eagle.window.show();            // Show plugin window
await eagle.window.hide();            // Hide plugin window

await eagle.window.minimize();        // Minimize window
await eagle.window.restore();         // Restore minimized

await eagle.window.maximize();        // Maximize window
await eagle.window.unmaximize();      // Restore maximized

await eagle.window.setFullScreen(true);       // Set to fullscreen
await eagle.window.setFullScreen(false);      // Exit fullscreen
```

* * *

Show and focus the window.

*   Returns `Promise<>` 

`await eagle.window.show();`

* * *

Show the window but don't focus on it.

*   Returns `Promise<>` 

`await eagle.window.showInactive();`

* * *

Hide the plugin window.

*   Returns `Promise<>` 

`await eagle.window.hide();`

* * *

Give the plugin window focus.

*   Returns `Promise<>` 

`await eagle.window.focus();`

* * *

Minimize the plugin window.

*   Returns `Promise<>` 

`await eagle.window.minimize();`

* * *

Determine if the window is minimized.

*   
Returns `Promise<minimized: boolean>`

    *   `minimized` boolean - Whether the window is minimized 

`let isMinimized = await eagle.window.isMinimized();`

* * *

Restore the plugin window from a minimized state to its previous state.

*   Returns `Promise<>` 

`await eagle.window.restore();`

* * *

Maximize the plugin window. If the window has not yet been displayed, this method will also show it (but not focus on it).

*   Returns `Promise<>` 

`await eagle.window.maximize();`

* * *

Unmaximize the plugin window.

*   Returns `Promise<>` 

`await eagle.window.unmaximize();`

* * *

Determine if the window is maximized.

*   
Returns `Promise<maximized: boolean>`

    *   `maximized` boolean - Whether the window is maximized 

`let isMaximized = await eagle.window.isMaximized();`

* * *

Set whether the window should be in fullscreen mode.

*   `flag` boolean - Whether to set as fullscreen 
*   Returns `Promise<>` 

```
await eagle.window.setFullScreen(true);        // Enter fullscreen
await eagle.window.setFullScreen(false);       // Exit fullscreen
```

* * *

Determine if the window is in fullscreen mode.

*   
Returns `Promise<fullscreen: boolean>`

    *   `fullscreen` boolean - Whether the window is in fullscreen 

`let isMaximized = await eagle.window.isMaximized();`

* * *

This will make the window maintain its aspect ratio.

*   `aspectRatio` Float - The aspect ratio to maintain (width / height) 
*   Returns `Promise<>` 

`await eagle.window.setAspectRatio(16/9);        // Restrict the window aspect ratio to 16:9`

* * *

Set the background color of the window.

*   `backgroundColor` String - This parameter represents the HEX code of your desired background color. 
*   Returns `Promise<>` 

`await eagle.window.setBackgroundColor("#FFFFFF");`

Note 1: This property can be set directly in manifest.json.

Note 2: This setting is mainly used to set the default background color of the window when the HTML/CSS content is not yet complete. Proper setting can avoid the flickering of the window display.

* * *

Set window size.

*   `width` Integer - window width 
*   `height` - Integer - window height 
*   Returns `Promise<>` 

`await eagle.window.setSize(720, 480);`

Note: This property can be set directly in manifest.json.

Get window size.

*   Returns `Promise<Integer[]>` 

`await eagle.window.getSize();`

Adjust the window size and move it to the provided bounds. Any properties not provided will default to their current values.

`await eagle.window.setBounds({ x: 440, y: 225, width: 800, height: 600 })`

Get window bounds.

*   Returns `Promise<Rectangle[]>` - object representing the window bounds 

`await eagle.window.getBounds()`

Set whether the window supports resizing.

*   `resizable` boolean - whether resizing is supported 
*   Returns `Promise<>` 

```
await eagle.window.setResizable(true);
await eagle.window.setResizable(false);
```

Note: This property can be set directly in manifest.json.

* * *

Whether the window supports resizing.

*   
Returns `Promise<resizable: boolean>`

    *   `resizable` boolean 

`let isResizable = await eagle.window.isResizable();`

* * *

Set whether the window should always be displayed in front of other windows.

*   `flag` boolean 
*   Returns `Promise<>` 

```
await eagle.window.setAlwaysOnTop(true);
await eagle.window.setAlwaysOnTop(false);
```

* * *

Whether the window should always be displayed in front of other windows.

*   
Returns `Promise<alwaysOnTop: boolean>`

    *   `alwaysOnTop` boolean 

`let isAlwaysOnTop = await eagle.window.isAlwaysOnTop();`

* * *

Move the window to x and y.

*   `x` Integer 
*   `y` Integer 
*   Returns `Promise<>` 

`await eagle.window.setPosition(100, 200);`

* * *

Get plugin window coordinates x and y.

*   
Returns `Promise<position: Integer[]>`

    *   
`position` Integer[]

        *   x - position[0] 
        *   y - position[1] 

`let position = await eagle.window.getPosition();  // [100, 200]`

* * *

Set the opacity of the window, values outside the range are limited to the [0, 1] range.

*   `opacity` number - between 0.0 (completely transparent) and 1.0 (completely opaque) 
*   Returns `Promise<>` 

`await eagle.window.setOpacity(0.5);`

* * *

Get window opacity, between 0.0 (completely transparent) and 1.0 (completely opaque).

*   
Returns `Promise<opacity: number>`

    *   `opacity` number 

`let opacity = await eagle.window.getOpacity();`

* * *

Start or stop flashing the window to attract the user's attention.

*   `flag` boolean - whether to flash 
*   Returns `Promise<>` 

```
await eagle.window.flashFrame(true);
await eagle.window.flashFrame(false);
```

* * *

Ignore all mouse events within the window. All mouse events occurring in this window will be passed to the window below it but if this window has focus, it will still receive keyboard events.

*   `ignore` boolean - whether to ignore mouse events 
*   Returns `Promise<>` 

```
await eagle.window.setIgnoreMouseEvents(true);
await eagle.window.setIgnoreMouseEvents(false);
```

Combined with the setAlwaysOnTop() feature, you can create a special window that floats at the top of the screen and is permeable to mouse clicks.

Capture a snapshot of the page within the specified `rect` area. Omitting `rect` will capture the entire visible page.

*   
`rect` object - Optional, screenshot range

    *   `x` number 
    *   `y` number 
    *   `width` number 
    *   `height` number 

*   Returns `Promise<[NativeImage](https://www.electronjs.org/docs/latest/api/native-image)>` 

```
const image = await eagle.window.capturePage();
const base64 = image.toDataURL("image/jpeg");

const image2 = await eagle.window.capturePage({ x: 0, y: 0, width: 100, height: 50 });
const buffer = image2.toPNG();
```

Sets the current referer URL. Once set, subsequent requests will utilize this referer.

*   `url` string - The URL of the referer. 
*   Returns `void` 

`eagle.window.setReferer("https://en.eagle.cool");`

Last updated 1 year ago

