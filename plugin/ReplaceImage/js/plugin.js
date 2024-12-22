eagle.onPluginCreate((plugin) => {
    console.log('Plugin created:', plugin);

    // Add HTML elements dynamically to the page
    const main = document.querySelector('main');
    const container = document.createElement('div');
    container.style.margin = '20px';

    const clipboardContent = document.createElement('div');
    clipboardContent.id = 'clipboardContent';
    clipboardContent.style.width = '100%';
    clipboardContent.style.height = '50px';
    clipboardContent.style.overflowY = 'scroll';
    clipboardContent.style.border = '1px solid #ccc';
    clipboardContent.style.backgroundColor = '#fff';
    clipboardContent.style.color = '#000';
    clipboardContent.style.padding = '10px';
    clipboardContent.style.marginBottom = '10px';
    clipboardContent.textContent = 'Clipboard content will appear here';

    const button = document.createElement('button');
    button.textContent = 'Replace';
    button.style.marginTop = '10px';
    button.id = 'replaceButton';

    const status = document.createElement('div');
    status.id = 'status';
    status.style.marginTop = '10px';
    status.style.color = 'yellow';

    container.appendChild(clipboardContent);
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

    // Add event listener for the button
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
});

eagle.onPluginRun(() => {
    console.log('Plugin is running');
});

eagle.onPluginHide(() => {
    console.log('Plugin hidden');
});

eagle.onPluginBeforeExit((event) => {
    console.log('Plugin is exiting');
});
