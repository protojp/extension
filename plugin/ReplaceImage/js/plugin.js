eagle.onPluginCreate((plugin) => {
    console.log('Plugin created:', plugin);

    // Add HTML elements dynamically to the page
    const main = document.querySelector('main');
    const container = document.createElement('div');
    container.style.margin = '5px 0';
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between'

    const buttonOriginal = document.createElement('button');
    buttonOriginal.textContent = '🔄Original';
    buttonOriginal.style.boxSizing = 'border-box'
    buttonOriginal.style.width = '100%';
    buttonOriginal.style.height = '50px';
    buttonOriginal.style.margin = '10px 0';
    buttonOriginal.id = 'originalButton';

    const button = document.createElement('button');
    button.textContent = '📋Replace Path';
    button.style.display = 'inline-block';
    button.style.boxSizing = 'border-box'
    button.style.width = '50%';
    button.style.height = '50px';
    button.style.margin = '0';
    button.style.padding = '0';
    button.id = 'replaceButton';

    const clipboardContent = document.createElement('div');
    clipboardContent.id = 'clipboardContent';
    clipboardContent.style.display = 'inline-block';
    // clipboardContent.style.margin = '0 auto';
    clipboardContent.style.width = '48%';
    clipboardContent.style.height = '50px';
    clipboardContent.style.marginRight = '2%';
    clipboardContent.style.overflowY = 'scroll';
    // clipboardContent.style.border = '1px solid #ccc';
    clipboardContent.style.backgroundColor = '#fff';
    clipboardContent.style.color = '#000';

    clipboardContent.textContent = 'Clipboard content will appear here';

    const status = document.createElement('div');
    status.id = 'status';
    status.style.marginTop = '10px';
    status.style.color = 'yellow';

    container.appendChild(clipboardContent);
    container.appendChild(button);
    container.appendChild(status);
    main.appendChild(buttonOriginal);
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
            // Perform the replacement
            await item.replaceFile(newFilePath);

            // Check success based on known conditions (e.g., log message)
            console.log('Replace item file success.');
            statusElement.textContent = `Success: File replaced${suffix ? ` with ${suffix}` : ''} successfully`;
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

    // Add event listener for the originalButton button
    buttonOriginal.addEventListener('click', async () => {
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
