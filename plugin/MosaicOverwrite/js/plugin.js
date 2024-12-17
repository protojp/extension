eagle.onPluginCreate(async(plugin) => {
	console.log("!!MosaicOverwrite START!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(plugin);

	const { execFile } = require('child_process');
	const path = require('path');
	const fs = require('fs/promises');
	const iconv = require('iconv-lite');

	const targetFolderName = '1stOutputWebUI';

	async function processImage() {
		// すべてのフォルダを取得
		const folders = await eagle.folder.getAll();
		
		// ターゲットフォルダを検索
		const targetFolder = folders.find(folder => folder.name === targetFolderName);
		
		if (!targetFolder) {
			console.log(`フォルダ "${targetFolderName}" が見つかりませんでした。`);
			return;
		}

		// ターゲットフォルダ内の画像を取得（rating: 0のもの）
		const items = await eagle.item.get({ 
			folders: [targetFolder.id],
			rating: 0 
		});
		
		if (items.length === 0) {
			console.log('該当する画像がありません。');
			return;
		}

		// 仮想環境内のPython実行ファイルのパス
		const pythonPath = 'D:\\ai\\automosaic_2024-08-17\\venv\\Scripts\\python.exe';
		const scriptPath = 'D:\\ai\\automosaic_2024-08-17\\automosaic.py';

		// 処理対象の画像IDを保持する配列
		const processedItemIds = [];

		// 各画像に対してモザイク処理を実行
		for (const item of items) {
			if (item.tags.length === 0) {
				console.log('画像にタグがないため、スキップします。');
				continue;
			}

			const filePath = item.filePath;

			// モザイク処理を実行
			const args = [scriptPath, '-ssd', '-c', '0.37', filePath];
			console.log(`モザイク処理を実行中: ${filePath}`);

			try {
				// Pythonスクリプト実行
				const { stdout, stderr } = await new Promise((resolve, reject) => {
					execFile(pythonPath, args, { encoding: 'buffer', cwd: path.dirname(scriptPath) }, (error, stdout, stderr) => {
						if (error) {
							reject({ error, stdout, stderr });
						} else {
							resolve({ stdout, stderr });
						}
					});
				});

				const decodedOutput = iconv.decode(stdout, 'shift_jis');
				const decodedError = iconv.decode(stderr, 'shift_jis');
				console.log('モザイク処理の出力:', decodedOutput);
				console.log('モザイク処理のエラー出力:', decodedError);

				// モザイク対象がない場合はスキップ
				if (decodedOutput.includes('(no detections)')) {
					console.log('モザイク対象がないため、画像を変更しません:', filePath);
					continue;
				}

				// モザイク処理済みファイルのパスを生成
				const mosaicFileName = path.basename(filePath, path.extname(filePath)) + '_mosaic.png';
				const mosaicFilePath = path.join(path.dirname(filePath), mosaicFileName);

				// 画像を置き換え
				await item.replaceFile(mosaicFilePath);
				console.log('画像を正常に置き換えました。');

				// タグを追加
				item.tags.push('Mosaic_ow');
				await item.save();
				console.log('タグを追加しました: Mosaic_ow');

				// 一時的な_mosaic.png画像を削除
				await fs.unlink(mosaicFilePath);
				console.log('一時的な _mosaic.png 画像を削除しました。');

				// 処理が完了した画像のIDを追加
				processedItemIds.push(item.id);
			} catch (error) {
				console.error('画像処理中にエラーが発生しました:', error);
			}
		}

		// 処理済みの画像をターゲットフォルダから除外
		if (items.length > 0) {
			console.log(items);
			// const processedItemIds = items.map(item => item.id);
			// await Promise.all(processedItemIds.map(itemId => 
			// 	eagle.item.update(itemId, { 
			// 		folders: items.find(item => item.id === itemId).folders.filter(folderId => folderId !== targetFolder.id) 
			// 	})
			// ));
			// console.log(`${processedItemIds.length}個の画像をフォルダから除外しました。`);
		}
	}

	processImage().catch(error => {
		console.error('処理中にエラーが発生しました:', error.message);
	});
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