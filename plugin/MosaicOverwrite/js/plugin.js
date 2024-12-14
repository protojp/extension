eagle.onPluginCreate(async(plugin) => {
	console.log("!!MosaicOverwrite START!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(plugin);

	const { execFile } = require('child_process');
	const path = require('path');
	const fs = require('fs/promises');
	const iconv = require('iconv-lite');
	
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
	
			if (item.tags.length === 0) {
				console.log('画像にタグがないため、処理を終了します。');
				return;
			}
			// モザイク処理を実行
			// '-sp',引数：プレビュー画像を保存
			const args = [scriptPath, '-ssd','-n','-c','0.37', filePath];
				
			console.log(`モザイク処理を実行中: ${filePath}`);
	
			await new Promise((resolve, reject) => {
				execFile(pythonPath, args, { encoding: 'buffer', cwd: path.dirname(scriptPath) }, (error, stdout, stderr) => {
					if (error) {
						const decodedError = iconv.decode(stderr, 'shift_jis');
						reject(new Error(`モザイク処理中にエラーが発生しました: ${decodedError}`));
					} else {
						const decodedOutput = iconv.decode(stdout, 'shift_jis');
						console.log('モザイク処理が成功しました:', decodedOutput);
						resolve();
					}
				});
			});
	
			// モザイク処理済みファイルのパスを推測
			const mosaicFileName = path.basename(filePath, path.extname(filePath)) + '_mosaic.png';
			const mosaicFilePath = path.join(path.dirname(filePath), mosaicFileName);
	
			console.log(mosaicFilePath);
			try {
				await fs.access(mosaicFilePath); // ファイルが存在するか確認
			} catch {
				throw new Error('モザイク処理されたファイルが見つかりません。');
			}

			// モザイク処理が完了した画像を置き換え
			try {
				await item.replaceFile(mosaicFilePath);
				console.log('画像を正常に置き換えました。');
			
				// タグを追加
				item.tags.push('Mosaic_ow');
				await item.save();
				console.log('タグを追加しました: Mosaic_ow');

				// _mosaic.png 画像を削除 
				await fs.unlink(mosaicFilePath); 
				console.log('一時的な _mosaic.png 画像を削除しました。'); 
			} catch (error) {
				console.error('画像の置き換え中にエラーが発生しました:', error);
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