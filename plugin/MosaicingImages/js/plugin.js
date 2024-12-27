eagle.onPluginCreate(async(plugin) => {
	console.log("!!Mosaicing Images START!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	console.log(plugin);

	const { execFile } = require('child_process');
	const path = require('path');
	const fs = require('fs/promises');
	const iconv = require('iconv-lite');

	const targetFolderName = "1stOutputWebUI";//'1stOutputWebUI';//生成時出力フォルダ。処理終了の判定に使う。
	const addTag = "MosaicedIMG";//モザイク後付けるタグ
	const targetTags = ["nsfw","nude"]; // タグフィルタリング配列
	const tagFilter = true;//処理対象に画像タグを考慮するかフラグ（SD作成以外の画像を処理対象にするか）

	const replaceImage = true;//画像をモザイク画像で置き換えるかフラグ

	const baseMosaicModel = "AnimePussy_best-5.pt";
	const mosaicModelsTargetTag = 
	{
		"1boy":"penis.pt"
		// ,"1girl":"AnimePussy_best-5.pt"
	};

	async function processImage() {
		
		const folders = await eagle.folder.getAll();// すべてのフォルダを取得
		const targetFolder = folders.find(folder => folder.name === targetFolderName);
		// const mosaicModel = baseMosaicModel;

		if (!targetFolder) {
			console.log(`フォルダ "${targetFolderName}" が見つかりませんでした。`);
			return;
		}

		var searchObj = {};
		if(targetTags.length && tagFilter)
		{
			searchObj = { folders: [targetFolder.id],tags: targetTags};
		}else{
			searchObj = { folders: [targetFolder.id]};
		}

		// console.log(searchObj);

		// ターゲット画像を取得
		const items = await eagle.item.get(searchObj);

		console.log(`ターゲット画像 "${items.length}" 枚`);

		// 仮想環境内のPython実行ファイルのパス
		const pythonPath = 'D:\\ai\\automosaic_2024-08-17\\venv\\Scripts\\python.exe';
		const scriptPath = 'D:\\ai\\automosaic_2024-08-17\\automosaic.py';

		// 各画像に対してモザイク処理を実行
		// 各画像に対してモザイク処理を実行
		for (const item of items) {

			if (item.tags.length === 0 && tagFilter) continue;
			
			const filePath = item.filePath;

			console.log("##loop#################################");

			// モザイクモデルを設定
			let mosaicModel = baseMosaicModel;

			// 画像のタグに基づいて追加のモザイクモデルを動的に構築
			const additionalModels = new Set(); // 重複を防ぐためSetを使用
			for (const tag of item.tags) {
				if (mosaicModelsTargetTag[tag]) {
					additionalModels.add(mosaicModelsTargetTag[tag]);
				}
			}

			// モザイクモデルをカンマ区切りで作成
			mosaicModel += ',' + Array.from(additionalModels).join(',');

			console.log(`使用するモザイクモデル: ${mosaicModel}`);

			const args = [scriptPath, '-ssd', '-c', '0.35', '-s', '12', '-m', mosaicModel, filePath];
			//'-sp',プレビュー画像を保存する。ADetailerとかでよく見る、枠と点数がついてる画像を出力する

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
				if(replaceImage)
					await item.replaceFile(mosaicFilePath);

				// タグを追加
				await item.tags.push(addTag);
				await item.save();

				// 一時的な_mosaic.png画像を削除
				if (replaceImage)
					await fs.unlink(mosaicFilePath);
			} catch (error) {
				console.error('画像処理中にエラーが発生しました:', error);
			}
		}

		console.log('全ターゲット画像処理が完了！');

		const itemsAll = await eagle.item.get({ 
			folders: [targetFolder.id],
		});
		//フォルダ内画像をフォルダから除外処理
		if (itemsAll.length > 0){
			for (const item of itemsAll) {
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