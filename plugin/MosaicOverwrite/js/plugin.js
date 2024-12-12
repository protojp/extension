eagle.onPluginCreate(async(plugin) => {
	console.log("!!MosaicOverwrite START!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(plugin);

	const { execFile } = require('child_process');
	const path = require('path');

	async function processImage() {
		try {
			// rating: 0の画像を取得
			const items = await eagle.item.get({ rating: 0 });
			if (items.length === 0) {
				console.log('該当する画像がありません。');
				return;
			}
			
			const item = items[0];
			const filePath = item.filePath; // 画像ファイルのパスを取得
	
			// 仮想環境内のPython実行ファイルのパス
			const pythonPath = 'D:\\ai\\automosaic_2024-08-17\\venv\\Scripts\\python.exe';
			const scriptPath = 'D:\\ai\\automosaic_2024-08-17\\automosaic.py';
	
			// モザイク処理を実行
			const args = [scriptPath, '-ssd', '-c', '0.25', filePath];
			console.log(`モザイク処理を実行中: ${filePath}`);
	
			await new Promise((resolve, reject) => {
				execFile(pythonPath, args, (error, stdout, stderr) => {
					if (error) {
						reject(new Error(`モザイク処理中にエラーが発生しました: ${stderr}`));
					} else {
						console.log('モザイク処理が成功しました:', stdout);
						resolve();
					}
				});
			});
	
			// モザイク処理が完了した画像を置き換え
			const result = await item.replaceFile(filePath);
			if (result) {
				console.log('画像を正常に置き換えました。');
	
				// タグを追加
				item.tags.push('Mosaic_ow');
				await item.save();
				console.log('タグを追加しました: Mosaic_ow');
			} else {
				console.log('画像の置き換えに失敗しました。');
			}
		} catch (error) {
			console.error(error.message);
		}
	}
	
	processImage();
});

eagle.onPluginRun(() => {
	console.log('eagle.onPluginRun');
});

// eagle.onPluginShow(() => {
// 	console.log('eagle.onPluginShow');
// });

// eagle.onPluginHide(() => {
// 	console.log('eagle.onPluginHide');
// });

// eagle.onPluginBeforeExit((event) => {
// 	console.log('eagle.onPluginBeforeExit');
// });