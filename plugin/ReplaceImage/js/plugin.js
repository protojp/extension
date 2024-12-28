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

    // Common function to handle file replacement
    async function replaceFile(selected, suffix, statusElement) {
        if (!selected || selected.length === 0) {
            statusElement.textContent = 'Error: No file selected';
            return;
        }

        const item = selected[0];
        if (!item.filePath) {
            statusElement.textContent = 'Error: Selected item has no path';
            return;
        }

        const newFilePath = suffix
            ? item.filePath.replace(/(\.[^.]+)$/, `${suffix}$1`)
            : clipboardContent.textContent;

        console.log('File path to replace:', newFilePath);

        try {
            const result = await item.replaceFile(newFilePath);

            if (result) {
                statusElement.textContent = `Success: File replaced${suffix ? ` with ${suffix}` : ''} successfully`;
            } else {
                statusElement.textContent = `Error: Failed to replace file${suffix ? ` with ${suffix}` : ''}`;
            }
        } catch (error) {
            console.error('Error:', error);
            statusElement.textContent = `Error: ${error.message}`;
        }
    }

    // Add event listener for the replace button
    button.addEventListener('click', async () => {
        const status = document.getElementById('status');
        const selected = await eagle.item.getSelected();
        await replaceFile(selected, '', status);
    });

    // Add event listener for the replace_original button
    button2.addEventListener('click', async () => {
        const status = document.getElementById('status');
        const selected = await eagle.item.getSelected();
        await replaceFile(selected, '_original', status);
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
