
eagle.onPluginCreate(async(plugin) => {

	const fs = require('fs');
	const path = require('path');
	const archiver = require('archiver');
	const Jimp = require('jimp');


	console.log('eagle.onPluginCreate');
	console.log(plugin);

	document.querySelector('#message').innerHTML = `
	テストテスト<br>
	<ul>
		<li>id: ${plugin.manifest.id}</li>
		<li>version: ${plugin.manifest.version}</li>
		<li>name: ${plugin.manifest.name}</li>
		<li>logo: ${plugin.manifest.logo}</li>
		<li>path: ${plugin.path}</li>
	</ul>
	`;

	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(eagle);

	const targetRatings = [3, 2];
    const targetDate = new Date('2024-06-24');
    const outputFolder = 'D:/Download';
    const maxImages = 25;
    const watermarkPath = 'D:/Eagle/SDwebUI.library/images/LXU77UWL2CM8G.info/@proto_jp.png';
    
    // ウォーターマークの設定（デフォルト値）
    const watermarkConfig = {
        width: 300, // ウォーターマークの幅
        height: 100, // ウォーターマークの高さ
        x: 'right', // 'left', 'center', 'right', または数値
        y: 'bottom', // 'top', 'middle', 'bottom', または数値
        opacity: 0.8, // 不透明度（0-1の範囲）
        marginX: 30, // X軸のマージン（ピクセル）
        marginY: 20  // Y軸のマージン（ピクセル）
    };

    try {
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder, { recursive: true });
        }

        const items = await eagle.item.get({});

        const filteredItems = items
            .filter(item => {
                const itemDate = new Date(item.importedAt);
                return targetRatings.includes(item.star) && 
                       itemDate.toDateString() === targetDate.toDateString();
            })
            .sort((a, b) => b.star - a.star)
            .slice(0, maxImages);

        if (filteredItems.length === 0) {
            console.log('条件に合う画像が見つかりませんでした。');
            return;
        }

        const outputFileName = `images_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
        const outputPath = path.join(outputFolder, outputFileName);

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        const closePromise = new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
        });

        archive.pipe(output);

        // ウォーターマーク画像の読み込み
        const watermark = await Jimp.read(watermarkPath);
        watermark.resize(watermarkConfig.width, watermarkConfig.height);
        watermark.opacity(watermarkConfig.opacity);

        const tempFiles = []; // 一時ファイルのパスを保存する配列

        for (let i = 0; i < filteredItems.length; i++) {
            const item = filteredItems[i];
            const filePath = item.filePath;
            const fileExt = path.extname(filePath);
            const itemDate = new Date(item.importedAt);
            const formattedDate = itemDate.toISOString().split('T')[0];
            const newFileName = `${formattedDate}_${(i + 1).toString().padStart(3, '0')}_rate${item.star}${fileExt}`;

            // 画像の読み込みとウォーターマークの追加
            const image = await Jimp.read(filePath);
            
            // ウォーターマークの位置を計算（マージンを考慮）
            let x, y;
            if (watermarkConfig.x === 'left') x = watermarkConfig.marginX;
            else if (watermarkConfig.x === 'center') x = (image.getWidth() - watermark.getWidth()) / 2;
            else if (watermarkConfig.x === 'right') x = image.getWidth() - watermark.getWidth() - watermarkConfig.marginX;
            else x = watermarkConfig.x;

            if (watermarkConfig.y === 'top') y = watermarkConfig.marginY;
            else if (watermarkConfig.y === 'middle') y = (image.getHeight() - watermark.getHeight()) / 2;
            else if (watermarkConfig.y === 'bottom') y = image.getHeight() - watermark.getHeight() - watermarkConfig.marginY;
            else y = watermarkConfig.y;

            image.composite(watermark, x, y, {
                mode: Jimp.BLEND_SOURCE_OVER,
                opacitySource: watermarkConfig.opacity
            });

            // 処理済み画像を一時ファイルとして保存
            const tempFilePath = path.join(outputFolder, `temp_${Date.now()}_${newFileName}`);
            await image.writeAsync(tempFilePath);
            tempFiles.push(tempFilePath); // 一時ファイルのパスを保存

            // 一時ファイルをアーカイブに追加
            archive.file(tempFilePath, { name: newFileName });
        }

        await archive.finalize();
        await closePromise;

        console.log(`ZIPファイルが正常に保存されました: ${outputPath}`);
        console.log(`圧縮された画像の数: ${filteredItems.length}`);

        // 一時ファイルの削除
        tempFiles.forEach(tempFilePath => {
            try {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            } catch (err) {
                console.warn(`一時ファイルの削除に失敗しました: ${tempFilePath}`, err);
            }
        });

    } catch (error) {
        console.error('エラーが発生しました:', error);
        console.error('エラーのスタックトレース:', error.stack);
    }

});

eagle.onPluginRun(async () => {
	console.log('eagle.onPluginRun');
});

eagle.onPluginShow(() => {
	console.log('eagle.onPluginShow');
});

eagle.onPluginHide(() => {
	console.log('eagle.onPluginHide');
});

eagle.onPluginBeforeExit((event) => {
	console.log('eagle.onPluginBeforeExit');
});