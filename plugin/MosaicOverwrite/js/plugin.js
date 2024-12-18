eagle.onPluginCreate(async(plugin) => {
	console.log("!!MosaicOverwrite START!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(plugin);

	const { execFile } = require('child_process');
	const path = require('path');
	const fs = require('fs/promises');
	const iconv = require('iconv-lite');

	const targetFolderName = "1stOutputWebUI";//'1stOutputWebUI';//生成時出力フォルダ。処理終了の判定に使う。
	const targetTags = ["nsfw","nude"]; // タグフィルタリング配列
	const tagFilterEnabled = false;//タグを考慮するかフラグ

	async function processImage() {
		
		const folders = await eagle.folder.getAll();// すべてのフォルダを取得
		const targetFolder = folders.find(folder => folder.name === targetFolderName);

		if (!targetFolder) {
			console.log(`フォルダ "${targetFolderName}" が見つかりませんでした。`);
			return;
		}

		var searchObj = {};
		if(targetTags.length && tagFilterEnabled)
		{
			searchObj = { folders: [targetFolder.id],tags: targetTags};
		}else{
			searchObj = { folders: [targetFolder.id]};
		}

		console.log(searchObj);

		// ターゲット画像を取得
		const items = await eagle.item.get(searchObj);
		
		if (items.length === 0) {
			console.log('該当する画像がありません。');
			return;
		}

		console.log(`ターゲット画像 "${items.length}" 枚`);

		// 仮想環境内のPython実行ファイルのパス
		const pythonPath = 'D:\\ai\\automosaic_2024-08-17\\venv\\Scripts\\python.exe';
		const scriptPath = 'D:\\ai\\automosaic_2024-08-17\\automosaic.py';

		// 各画像に対してモザイク処理を実行
		for (const item of items) {

			if (item.tags.length === 0 && tagFilterEnabled) continue;
			
			const filePath = item.filePath;

			console.log("##loop#################################");
			// ターゲットフォルダIDを配列から削除
			// item.folders = item.folders.filter(folderId => folderId !== targetFolder.id);
			// await item.save();

			// モザイク処理を実行
			const args = [scriptPath,'-ssd','-sp','-c','0.35','-s','12','-m','AnimePussy_best-5.pt', filePath];
			// console.log(`モザイク処理を実行中: ${filePath}`);

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

				// const decodedOutput = iconv.decode(stdout, 'shift_jis');
				// const decodedError = iconv.decode(stderr, 'shift_jis');
				// console.log('モザイク処理の出力:', decodedOutput);
				// console.log('モザイク処理のエラー出力:', decodedError);

				// モザイク処理済みファイルのパスを生成
				const mosaicFileName = path.basename(filePath, path.extname(filePath)) + '_mosaic.png';
				const mosaicFilePath = path.join(path.dirname(filePath), mosaicFileName);
				
				// モザイク画像が存在しない場合はスキップ
				try {
					await fs.access(mosaicFilePath);
				} catch {
					console.log('モザイク無しSKIP:', filePath);
					continue;
				}

				// 画像を置き換え
				await item.replaceFile(mosaicFilePath);
				// console.log('画像を正常に置き換えました。');

				// タグを追加
				await item.tags.push('Mosaic_ow');
				await item.save();
				// console.log('タグを追加しました: Mosaic_ow');

				// 一時的な_mosaic.png画像を削除
				await fs.unlink(mosaicFilePath);
				// console.log('一時的な _mosaic.png 画像を削除しました。');
			} catch (error) {
				console.error('画像処理中にエラーが発生しました:', error);
			}
		}
		console.log('全ターゲット画像処理が完了！');

		
		items = await eagle.item.get({ 
			folders: [targetFolder.id],
		});
		//フォルダ内画像をフォルダから除外処理
		if (items.length > 0){
			for (const item of items) {
				item.folders = item.folders.filter(folderId => folderId !== targetFolder.id);
				await item.save();
			}
			console.log('画像をフォルダから除外完了');
		}
	}

	processImage().catch(error => {
		console.error('処理中にエラーが発生しました:', error.message);
		console.log(error);
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