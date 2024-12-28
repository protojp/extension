eagle.onPluginCreate((plugin) => {
    console.log('Plugin created:', plugin);

    // Add HTML elements dynamically to the page
    const main = document.querySelector('main');
    const container = document.createElement('div');
    container.style.margin = '5px';

    const clipboardContent = document.createElement('div');
    clipboardContent.id = 'clipboardContent';
    clipboardContent.style.display = 'block';
    clipboardContent.style.margin = '0 auto';
    clipboardContent.style.height = '50px';
    clipboardContent.style.overflowY = 'scroll';
    clipboardContent.style.border = '1px solid #ccc';
    clipboardContent.style.backgroundColor = '#fff';
    clipboardContent.style.color = '#000';
    clipboardContent.style.padding = '10px';
    clipboardContent.style.marginBottom = '10px';
    clipboardContent.textContent = 'Clipboard content will appear here';

    const button = document.createElement('button');
    button.textContent = '📋Replace';
    button.style.width = '75%';
    button.style.height = '50px';
    button.id = 'replaceButton';

    const button2 = document.createElement('button');
    button2.textContent = '🔄Original';
    button2.style.width = '25%';
    button2.style.height = '50px';
    button2.id = 'replace_original';

    const status = document.createElement('div');
    status.id = 'status';
    status.style.marginTop = '10px';
    status.style.color = 'yellow';

    container.appendChild(clipboardContent);
    container.appendChild(button2);
    container.appendChild(button);
    container.appendChild(status);
    main.appendChild(container);

    // Clipboard monitoring on window focus
    async function monitorClipboard() {
        try {
            let text = await navigator.clipboard.readText();
            text = text.trim();
            if (text.startsWith('"') && text.endsWith('"')) {
                text = text.slice(1, -1);
            }
            clipboardContent.textContent = text || 'Clipboard is empty';
        } catch (error) {
            clipboardContent.textContent = 'Failed to read clipboard';
            console.error('Clipboard error:', error);
        }
    }

    window.addEventListener('focus', monitorClipboard);

    // Add event listener for the replace button
    button.addEventListener('click', async () => {
        const filePath = clipboardContent.textContent;
        const status = document.getElementById('status');

        if (!filePath || filePath === 'Clipboard is empty' || filePath === 'Failed to read clipboard') {
            status.textContent = 'Error: Clipboard content is invalid';
            return;
        }

        try {
            // Get selected file(s)
            const selected = await eagle.item.getSelected();
            if (!selected || selected.length === 0) {
                status.textContent = 'Error: No file selected';
                return;
            }

            // Replace the first selected file with the specified path
            const item = selected[0];
            const result = await item.replaceFile(filePath);

            if (result) {
                status.textContent = 'Success: File replaced successfully';
            } else {
                status.textContent = 'Error: Failed to replace file';
            }
        } catch (error) {
            console.error('Error:', error);
            status.textContent = `Error: ${error.message}`;
        }
    });

    // Add event listener for the replace_original button
    button2.addEventListener('click', async () => {
        const status = document.getElementById('status');

        console.log("button2!!!!")

        try {
            // Get selected file(s)
            const selected = await eagle.item.getSelected();
            if (!selected || selected.length === 0) {
                status.textContent = 'Error: No file selected';
                return;
            }

            console.log(selected);

            // Replace with the _original file
            const item = selected[0];
            if (!item.filePath) {
                status.textContent = 'Error: Selected item has no path';
                return;
            }

            const originalFilePath = item.filePath.replace(/(\.[^.]+)$/, '_original$1');
            console.log('Original file path:', originalFilePath);

            const result = await item.replaceFile(originalFilePath);

            if (result) {
                status.textContent = 'Success: File replaced with original successfully';
            } else {
                status.textContent = 'Error: Failed to replace file with original';
            }
        } catch (error) {
            console.error('Error:', error);
            status.textContent = `Error: ${error.message}`;
        }
    });
});

// eagle.onPluginRun(() => {
//     console.log('Plugin is running');
// });

// eagle.onPluginHide(() => {
//     console.log('Plugin hidden');
// });

// eagle.onPluginBeforeExit((event) => {
//     console.log('Plugin is exiting');
// });
