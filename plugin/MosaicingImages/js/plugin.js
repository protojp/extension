// 必要なモジュールをインポート
const { execFile } = require('child_process'); // Pythonスクリプト実行用
const path = require('path'); // パス操作用
const fs = require('fs/promises'); // ファイル非同期操作用

let config = {}; // ロードされた設定を格納するグローバル変数
let isConfigLoaded = false; // 設定がロードされたかどうかのフラグ

// --- 設定ファイルの読み込み関数 ---
async function loadConfig() {
	// 既にロード試行済みなら再実行しない (onPluginShowが複数回呼ばれる可能性を考慮)
	if (isConfigLoaded) return;
	try {
		// 'js' サブディレクトリ内の config.json へのパスを構築
		// __dirname はこのスクリプト(plugin.js)が存在するディレクトリを指す想定
		const configPath = path.join(__dirname, 'js', 'config.json');
		const data = await fs.readFile(configPath, 'utf-8'); // ファイルをUTF-8で読み込み
		config = JSON.parse(data); // JSON文字列をオブジェクトに変換
		isConfigLoaded = true; // ロード成功フラグを立てる
		console.log('設定ファイルをロードしました:', config);
	} catch (error) {
		console.error('config.json の読み込みエラー:', error);
		// エラー発生時は、ハードコードされたデフォルト値を使用
		config = { // 設定読み込み失敗時のデフォルト値
			targetFolderName: "1stOutputWebUI", // 対象フォルダ名
			addTag: "MosaicedIMG", // 付与するタグ
			targetTags: ["nsfw", "nude"], // 対象タグ (配列)
			tagFilter: true, // タグでフィルタリングするか
			replaceImage: true, // 元画像を置き換えるか
			baseMosaicModel: "ntd11_anime_nsfw_segm_v2_all.pt:0.2", // 基本のモザイクモデル
			mosaicModelsTargetTag: {}, // タグごとの追加モデル (空オブジェクト)
			pythonPath: "", // Python実行ファイルのパス (要設定)
			scriptPath: "", // automosaic.pyスクリプトのパス (要設定)
			mosaicStrength: 12 // モザイク強度
		};
		// isConfigLoaded は false のままにするか、エラー状態を示す別のフラグを立てても良い
		eagle.log.error('config.json の読み込みに失敗しました。デフォルト設定を使用します。');
	}
}

// --- 画像処理本体の関数 ---
async function processImages(currentConfig, uiTargetFolder, uiTargetTags) {
	console.log("画像処理を開始します...");
	console.log("使用する設定:", currentConfig);
	console.log("UI フォルダ:", uiTargetFolder);
	// processImages に渡されたタグ配列をログ出力
	console.log("渡された UI タグ (配列):", uiTargetTags, `(長さ: ${uiTargetTags.length})`);

	const folders = await eagle.folder.getAll(); // Eagleライブラリ内の全フォルダを取得
	// UIで指定されたフォルダ名に一致するフォルダオブジェクトを検索
	const targetFolder = folders.find(folder => folder.name === uiTargetFolder);

	// ターゲットフォルダが見つからない場合のエラーハンドリング
	if (!targetFolder) {
		console.error(`フォルダ "${uiTargetFolder}" が見つかりませんでした。`);
		eagle.log.error(`フォルダ "${uiTargetFolder}" が見つかりませんでした。`); // EagleのUIにもエラー表示
		return; // 処理を中断
	}

	// Eagleのアイテム検索条件オブジェクトを作成
	let searchObj = { folders: [targetFolder.id] }; // まずはフォルダIDで絞り込み
	// UIから渡されたタグ配列 (uiTargetTags) が空でない (要素が1つ以上ある) 場合のみ、タグ検索条件を追加
	if (Array.isArray(uiTargetTags) && uiTargetTags.length > 0) {
		console.log(`タグ検索条件を追加します: [${uiTargetTags.join(', ')}]`);
		searchObj.tags = uiTargetTags; // 検索条件に tags プロパティを追加
	} else {
		console.log("UIターゲットタグが空のため、タグ検索条件は追加しません。");
		// searchObj.tags は追加しない => フォルダ内の全アイテムが対象
	}
	// 最終的にEagle APIに渡す検索条件オブジェクトをログ出力
	console.log("Eagleアイテム検索条件:", searchObj);

	const items = await eagle.item.get(searchObj); // 条件に合うアイテムを取得
	console.log(`ターゲット画像 "${items.length}" 枚`);
	// 処理対象がない場合はメッセージを表示して終了
	if (items.length === 0) {
		console.log("処理対象の画像が見つかりませんでした。");
	eagle.log.info("処理対象の画像が見つかりませんでした。");
		return { processedCount: 0, errorCount: 0 }; // 処理数を返すように変更
	}

	// Python実行パスとスクリプトパスが設定されているか確認
	if (!currentConfig.pythonPath || !currentConfig.scriptPath) {
		console.error("Pythonのパスまたはスクリプトのパスが config.json で設定されていません。");
		eagle.log.error("Pythonのパスまたはスクリプトのパスが設定されていません。");
		return { processedCount: 0, errorCount: 0 }; // 処理数を返すように変更
	}

	let processedCount = 0; // 処理成功カウント用変数
	let errorCount = 0; // 処理失敗カウント用変数

	// 取得した各アイテムに対してループ処理
	for (const item of items) {
		// 個々のアイテム処理を新しい関数に委譲
		const success = await processSingleItem(item, currentConfig, uiTargetTags);
		if (success) {
			processedCount++;
		} else {
			errorCount++;
		}
	} // アイテムごとのループ終了

	// 全アイテム処理後の最終結果をログに出力
	console.log(`フォルダ "${uiTargetFolder}" の処理完了: ${processedCount} 枚成功, ${errorCount} 枚エラー`);
	// ここでの eagle.log.info は呼び出し元で行うため削除

	// オプション: 処理後に全アイテムをフォルダから移動する場合 (必要ならコメント解除、設定化検討)
	// このロジックは個別のアイテム処理後に行うべきか、全体の後で行うべきか要検討
	// 現状では processSingleItem 内でタグ付けや保存が行われるため、ここでは不要かもしれない
	// const itemsAll = await eagle.item.get({ folders: [targetFolder.id] });
	// if (itemsAll.length > 0) {
	// 	for (const item of itemsAll) {
	// 		item.folders = item.folders.filter(folderId => folderId !== targetFolder.id);
	// 		await item.save();
	// 	}
	// 	console.log('画像をフォルダから除外完了');
	// }

	return { processedCount, errorCount }; // 処理結果を返す
}

// --- 単一アイテムのモザイク処理関数 ---
/**
 * 単一のアイテムにモザイク処理を適用する
 * @param {object} item 処理対象のEagleアイテムオブジェクト
 * @param {object} currentConfig 現在のプラグイン設定
 * @param {string[]} uiTargetTags UIで指定されたターゲットタグ (フィルタリング用)
 * @returns {Promise<boolean>} 処理に成功した場合はtrue、失敗またはスキップした場合はfalse
 */
async function processSingleItem(item, currentConfig, uiTargetTags) {
	// 設定ファイルから必要な値を変数に展開 (可読性のため)
	const pythonPath = currentConfig.pythonPath;
	const scriptPath = currentConfig.scriptPath;
	const addTag = currentConfig.addTag;
	const replaceImage = currentConfig.replaceImage;
	const baseMosaicModel = currentConfig.baseMosaicModel;
	const mosaicModelsTargetTag = currentConfig.mosaicModelsTargetTag;
	const mosaicStrength = currentConfig.mosaicStrength;

	// --- スキップ条件判定 ---
	// 1. 画像サイズのチェック
	if (1024 > item.height || 1024 > item.width) {
		console.log(`アイテムをスキップ (サイズ不足): ${item.name} (ID: ${item.id})`);
		return false; // スキップは失敗扱いとする
	}
	// 2. タグフィルタリングのスキップ判定 (configで有効 & UIタグ指定ありの場合)
	if (currentConfig.tagFilter && uiTargetTags && uiTargetTags.length > 0 && item.tags.length === 0) {
		console.log(`アイテムをスキップ (タグフィルタ有効 & UIタグ指定あり & アイテムタグなし): ${item.name} (ID: ${item.id})`);
		return false; // スキップは失敗扱いとする
	}
	// 3. 既にモザイクタグが付いている場合はスキップ (オプション)
	if (addTag && item.tags.includes(addTag)) {
		console.log(`アイテムをスキップ (既にタグ "${addTag}" が付いています): ${item.name} (ID: ${item.id})`);
		return false; // スキップは失敗扱いとする
	}


	const filePath = item.filePath; // アイテムのファイルパスを取得
	console.log(`処理中: ${item.name} (${filePath})`);

	// --- モザイクモデルの決定 ---
	let mosaicModel = baseMosaicModel; // まず基本モデルを設定
	const additionalModels = new Set(); // 追加モデルを格納するSet (重複を防ぐ)
	for (const tag of item.tags) { // アイテムが持つ各タグをチェック
		// 設定ファイルに、そのタグに対応するモデル定義があれば
		if (mosaicModelsTargetTag && mosaicModelsTargetTag[tag]) {
			additionalModels.add(mosaicModelsTargetTag[tag]); // Setに追加
		}
	}
	// 追加モデルが一つ以上あれば、基本モデルにカンマ区切りで結合
	if (additionalModels.size > 0) {
		mosaicModel += ',' + Array.from(additionalModels).join(',');
	}
	console.log(`  使用するモザイクモデル: ${mosaicModel}`);

	// --- Pythonスクリプト実行 ---
	// スクリプトへの引数リストを作成
	const args = [scriptPath, filePath, '-ssd', '-s', String(mosaicStrength), '-m', mosaicModel];

	try {
		// execFileでPythonスクリプトを非同期実行し、完了を待つ
		await new Promise((resolve, reject) => {
			execFile(pythonPath, args, { encoding: 'buffer', cwd: path.dirname(scriptPath) }, (error, stdout, stderr) => {
				if (error) {
					console.error(`  Pythonスクリプト実行エラー (${item.name}):`, error);
					console.error(`  Stderr: ${stderr.toString()}`);
					reject({ error, stdout, stderr });
				} else {
					console.log(`  Stdout (${item.name}): ${stdout.toString()}`);
					resolve({ stdout, stderr });
				}
			});
		});

		// --- モザイク処理後のファイル操作 ---
		const originalExt = path.extname(filePath);
		const mosaicFileName = path.basename(filePath, originalExt) + '_mosaic' + originalExt;
		const mosaicFilePath = path.join(path.dirname(filePath), mosaicFileName);

		// モザイクファイルが実際に生成されたか確認
		try {
			await fs.access(mosaicFilePath);
		} catch {
			console.log(`  モザイクファイルが見つかりません SKIP: ${mosaicFilePath}`);
			return false; // モザイクファイルがない場合は失敗扱い
		}

		// オリジナルを別名で保存
		const originalFilePath = path.join(path.dirname(filePath), path.basename(filePath, originalExt) + '_original' + originalExt);
		try {
			await fs.copyFile(filePath, originalFilePath);
			console.log(`  オリジナルを保存: ${originalFilePath}`);
		} catch (copyError) {
			console.error(`  オリジナルファイルのコピーに失敗: ${originalFilePath}`, copyError);
			// オリジナル保存失敗は致命的ではないかもしれないが、一旦エラーとして処理中断
			eagle.log.error(`オリジナルファイルのコピーに失敗 (${item.name})`);
			// 生成されたモザイクファイルを削除しようと試みる
			try { await fs.unlink(mosaicFilePath); } catch { /* ignore */ }
			return false;
		}


		// 設定に応じて元画像をモザイク画像で置き換え
		if (replaceImage) {
			console.log(`  ${item.name} をモザイク画像で置き換え`);
			await item.replaceFile(mosaicFilePath);
			// 置き換えが成功したら、一時的なモザイクファイルを削除
			try {
				await fs.unlink(mosaicFilePath);
				console.log(`  一時ファイルを削除: ${mosaicFilePath}`);
			} catch (unlinkError) {
				console.error(`  一時ファイルの削除に失敗: ${mosaicFilePath}`, unlinkError);
				// 削除失敗は警告ログに留める
				eagle.log.warn(`一時ファイル (${mosaicFileName}) の削除に失敗しました。`);
			}
		} else {
			// 置き換えない場合は、生成されたモザイクファイルはそのまま残る
			console.log(`  元画像は置き換えません。モザイクファイル: ${mosaicFilePath}`);
		}

		// 設定に応じてタグを追加 (アイテムにまだそのタグが付いていない場合のみ)
		if (addTag && !item.tags.includes(addTag)) {
			await item.tags.push(addTag);
			console.log(`  タグ "${addTag}" を ${item.name} に追加`);
		}
		// ファイル置き換えやタグ追加の変更をEagleライブラリに保存
		await item.save();
		console.log(`  アイテム "${item.name}" の処理成功。`);
		return true; // 成功

	} catch (error) { // tryブロック (Python実行〜ファイル操作) 内でエラーが発生した場合
		console.error(`  画像処理中にエラーが発生しました (${item.name}):`, error);
		eagle.log.error(`画像処理エラー (${item.name}): ${error.message || error}`);
		// エラーが発生した場合、生成された可能性のあるファイルをクリーンアップしようと試みる
		const mosaicFileName = path.basename(filePath, path.extname(filePath)) + '_mosaic' + path.extname(filePath);
		const mosaicFilePath = path.join(path.dirname(filePath), mosaicFileName);
		try { await fs.unlink(mosaicFilePath); console.log(`  エラー発生のため一時ファイル削除試行: ${mosaicFilePath}`); } catch { /* ignore */ }
		const originalFileName = path.basename(filePath, path.extname(filePath)) + '_original' + path.extname(filePath);
		const originalFilePath = path.join(path.dirname(filePath), originalFileName);
		try { await fs.unlink(originalFilePath); console.log(`  エラー発生のためオリジナルバックアップ削除試行: ${originalFilePath}`); } catch { /* ignore */ }

		return false; // 失敗
	}
}


// --- プラグインライフサイクルフック ---

// プラグインがEagleによって最初に読み込まれたときに一度だけ呼ばれる
eagle.onPluginCreate(async (plugin) => {
	console.log("Mosaicing Images プラグイン作成 (onPluginCreate)");
	console.log("Plugin details:", plugin);
	await loadConfig(); // 起動時に設定ファイルを非同期で読み込む
});

// プラグインメニューから実行されたときなど (UI表示とは限らない)
eagle.onPluginRun(() => {
	console.log('Mosaicing Images プラグイン実行 (onPluginRun)');
	// ここで設定の再読み込みや特定の処理を行うことも可能
});

// プラグインのUIパネルが表示されるたびに呼ばれる
eagle.onPluginShow(async () => {
	console.log('Mosaicing Images プラグイン表示 (onPluginShow)');
	// UI初期化の前に設定がロードされていることを確認
	if (!isConfigLoaded) { // まだロードされていなければ (初回表示時など)
		console.log('設定がまだロードされていないため、ロードを試みます。');
		await loadConfig(); // 設定を非同期でロードし、完了を待つ
	}

	// --- UI要素の取得と初期化 ---
	// HTML内の対応するIDを持つ要素を取得
	const targetFolderInput = document.getElementById('target-folder-input');
	const targetTagsInput = document.getElementById('target-tags-input');
	const restoreFolderInput = document.getElementById('restore-folder-input'); // 復元フォルダ入力
	const mosaicButton = document.getElementById('mosaic-button');
	const restoreButton = document.getElementById('restore-button'); // 復元ボタン

	// 各UI要素が存在するか確認してから値を設定 (念のため)
	if (targetFolderInput) {
		// configオブジェクトからフォルダ名を取得し、なければ空文字を設定
		targetFolderInput.value = config.targetFolderName || "";
	} else {
		console.error("UI要素 'target-folder-input' がHTML内に見つかりません。");
	}

	if (targetTagsInput) {
		// configオブジェクトからタグ配列を取得し、カンマ+スペース区切りの文字列に変換して設定
		// config.targetTags が存在しないか空配列の場合は空文字になる
		targetTagsInput.value = (config.targetTags || []).join(', ');
	} else {
		console.error("UI要素 'target-tags-input' がHTML内に見つかりません。");
	}

	if (restoreFolderInput) {
		// configから復元用フォルダ名を取得し、なければ空文字を設定
		restoreFolderInput.value = config.restoreFolderName || "";
	} else {
		console.error("UI要素 'restore-folder-input' がHTML内に見つかりません。");
	}

	// --- イベントリスナーの設定 ---
	// モザイク処理ボタンのクリックイベント
	if (mosaicButton) {
		// 既存のリスナーを削除 (onPluginShowが複数回呼ばれた際の重複登録を防ぐ)
		mosaicButton.onclick = null;
		// 新しいクリックイベントリスナーを登録
		mosaicButton.onclick = async () => {
			console.log('モザイク処理ボタンクリック');
			// 設定がロードされているか再確認 (念のため)
			if (!isConfigLoaded) {
				eagle.log.warn("設定がロードされていません。処理を中止します。");
				return;
			}
			// UI要素を再度取得して現在の値を確認 (より確実に)
			const currentTargetFolderInput = document.getElementById('target-folder-input');
			const currentTargetTagsInput = document.getElementById('target-tags-input');

			const uiFolder = currentTargetFolderInput?.value || config.targetFolderName;
			const uiTagsRaw = currentTargetTagsInput?.value || ""; // UIが空なら空文字を取得

            // タグ文字列を配列に変換 (カンマ区切り -> 各要素をtrim -> 空要素を除去)
            // uiTagsRawが "" なら、結果は空配列 [] になる
            const uiTagsArray = uiTagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

			// ★デバッグ用ログ: processImagesに渡す直前の値を確認
			console.log(`[Debug] processImages 呼び出し直前:`);
			console.log(`  uiFolder: "${uiFolder}"`);
			console.log(`  uiTagsRaw (UIの値): "${uiTagsRaw}"`);
			console.log(`  uiTagsArray (変換後):`, uiTagsArray);


			mosaicButton.disabled = true; // 処理中はボタンを無効化
			mosaicButton.innerText = "処理中..."; // ボタンのテキストを変更

			mosaicButton.disabled = true; // 処理中はボタンを無効化
			mosaicButton.innerText = "処理中..."; // ボタンのテキストを変更

			let totalProcessedSuccess = 0;
			let totalErrorsOrSkipped = 0;
			const itemsToProcessMap = new Map(); // 重複排除用 Map<itemId, itemObject>

			try {
				// 1. 選択中のアイテムを取得してMapに追加
				console.log("選択中のアイテムを取得中...");
				const selectedItems = await eagle.item.getSelected();
				if (selectedItems && selectedItems.length > 0) {
					console.log(`選択中のアイテム ${selectedItems.length} 件`);
					selectedItems.forEach(item => {
						if (!itemsToProcessMap.has(item.id)) {
							itemsToProcessMap.set(item.id, item);
						}
					});
				} else {
					console.log("選択中のアイテムはありません。");
				}

				// 2. 指定フォルダ内のアイテムを取得してMapに追加
				let folderItems = []; // フォルダアイテムを格納する配列
				if (uiFolder) {
					console.log(`フォルダ "${uiFolder}" 内のアイテムを取得中...`);
					const folders = await eagle.folder.getAll();
					const targetFolder = folders.find(folder => folder.name === uiFolder);

					if (targetFolder) {
						let searchObj = { folders: [targetFolder.id] };
						if (Array.isArray(uiTagsArray) && uiTagsArray.length > 0) {
							searchObj.tags = uiTagsArray;
							console.log(`フォルダ検索にタグ条件を追加: [${uiTagsArray.join(', ')}]`);
						} else {
							console.log("フォルダ検索にタグ条件は追加しません。");
						}
						console.log("フォルダ内アイテム検索条件:", searchObj);
						folderItems = await eagle.item.get(searchObj); // フォルダ内のアイテムを取得
						console.log(`フォルダ "${uiFolder}" 内で ${folderItems.length} 件のアイテムが見つかりました。`);
						folderItems.forEach(item => {
							if (!itemsToProcessMap.has(item.id)) {
								itemsToProcessMap.set(item.id, item);
							}
						});
					} else {
						console.error(`指定されたフォルダ "${uiFolder}" が見つかりませんでした。`);
						eagle.log.warn(`指定されたフォルダ "${uiFolder}" が見つかりませんでした。フォルダ内の処理はスキップされます。`);
					}
				} else {
					console.log("対象フォルダが指定されていないため、フォルダ内の処理はスキップします。");
				}

				// 3. 処理対象リストを作成し、総数を取得
				const itemsToProcess = Array.from(itemsToProcessMap.values());
				const totalItems = itemsToProcess.length;
				console.log(`合計 ${totalItems} 件のユニークなアイテムを処理します。`);

				if (totalItems === 0) {
					eagle.log.info("処理対象のアイテムがありませんでした。");
				} else {
					// 4. 処理ループと進捗ログ
					let processedCounter = 0;
					for (const item of itemsToProcess) {
						console.log(`--- アイテム処理開始: ${item.name} (ID: ${item.id}) ---`);
						const success = await processSingleItem(item, config, uiTagsArray);
						processedCounter++; // 処理済みカウンターをインクリメント
						if (success) {
							totalProcessedSuccess++;
							console.log(`--- アイテム処理成功: ${item.name} ---`);
						} else {
							totalErrorsOrSkipped++;
							console.log(`--- アイテム処理失敗/スキップ: ${item.name} ---`);
						}
						// 各アイテム処理後に進捗ログを出力
						console.log(`■■■■■　処理済み：${processedCounter}/${totalItems}　■■■■■`);
					}

					// 最終結果を通知
					eagle.log.info(`モザイク処理完了: 合計 ${totalProcessedSuccess} 枚成功, ${totalErrorsOrSkipped} 枚エラー/スキップ`);
				}

			} catch (error) { // 予期せぬエラー
				console.error("モザイク処理中に予期せぬエラー:", error);
				eagle.log.error(`モザイク処理中に予期せぬエラーが発生しました: ${error.message || error}`);
				totalErrorsOrSkipped++; // 予期せぬエラーもエラーカウントに含める
			} finally { // 処理が成功しても失敗しても、必ず実行されるブロック
				mosaicButton.disabled = false; // ボタンを再度有効化
				mosaicButton.innerText = "モザイク処理"; // ボタンのテキストを元に戻す
				console.log(`最終結果: ${totalProcessedSuccess} 枚成功, ${totalErrorsOrSkipped} 枚エラー/スキップ`);
			}
		};
	} else {
		console.error("UI要素 'mosaic-button' がHTML内に見つかりません。");
	}

	// オリジナル復元ボタンのクリックイベント
	if (restoreButton) {
		// 既存のリスナーを削除
		restoreButton.onclick = null;
		// 新しいクリックイベントリスナーを登録
		restoreButton.onclick = async () => {
			console.log('オリジナル復元ボタンクリック');
			// 設定がロードされているか確認
			if (!isConfigLoaded) {
				eagle.log.warn("設定がロードされていません。処理を中止します。");
				return;
			}
			// UI要素を再度取得して現在の値を確認
			const currentRestoreFolderInput = document.getElementById('restore-folder-input');
			const restoreFolderName = currentRestoreFolderInput?.value || config.restoreFolderName; // UIの値、なければconfigの値

			restoreButton.disabled = true; // 処理中はボタンを無効化
			restoreButton.innerText = "復元中..."; // ボタンのテキストを変更

			let totalRestored = 0;
			let totalErrors = 0;

			try {
				// 1. 選択中の画像を復元
				console.log("選択中の画像の復元を開始します...");
				const selectedItems = await eagle.item.getSelected();
				if (selectedItems && selectedItems.length > 0) {
					const { restoredCount, errorCount } = await restoreOriginalImages('selected', selectedItems);
					totalRestored += restoredCount;
					totalErrors += errorCount;
					console.log(`選択中の画像の復元完了: ${restoredCount} 枚成功, ${errorCount} 枚エラー`);
				} else {
					console.log("選択中の画像はありません。");
				}

				// 2. 指定フォルダ内の画像を復元
				if (restoreFolderName) {
					console.log(`フォルダ "${restoreFolderName}" 内の画像の復元を開始します...`);
					const { restoredCount, errorCount } = await restoreOriginalImages('folder', restoreFolderName);
					totalRestored += restoredCount;
					totalErrors += errorCount;
					console.log(`フォルダ "${restoreFolderName}" の復元完了: ${restoredCount} 枚成功, ${errorCount} 枚エラー`);
				} else {
					console.log("復元対象フォルダが指定されていません。");
				}

				eagle.log.info(`オリジナル復元完了: ${totalRestored} 枚成功, ${totalErrors} 枚エラー`);

			} catch (error) { // 予期せぬエラー
				console.error("オリジナル復元処理中に予期せぬエラー:", error);
				eagle.log.error("オリジナル復元処理中に予期せぬエラーが発生しました。");
			} finally { // 処理が成功しても失敗しても、必ず実行されるブロック
				restoreButton.disabled = false; // ボタンを再度有効化
				restoreButton.innerText = "オリジナル復元"; // ボタンのテキストを元に戻す
			}
		};
	} else {
		console.error("UI要素 'restore-button' がHTML内に見つかりません。");
	}
});

// --- オリジナル画像復元関数 ---
/**
 * 指定されたモードと対象に基づいてオリジナル画像を復元する
 * @param {'selected' | 'folder'} mode 復元モード ('selected': 選択アイテム, 'folder': 指定フォルダ)
 * @param {object[] | string} target 復元対象 (mode='selected'時はアイテム配列, mode='folder'時はフォルダ名)
 * @returns {Promise<{restoredCount: number, errorCount: number}>} 復元成功数とエラー数
 */
async function restoreOriginalImages(mode, target) {
	let itemsToRestore = [];
	let restoredCount = 0;
	let errorCount = 0;

	try {
		if (mode === 'selected') {
			itemsToRestore = target; // targetはアイテム配列のはず
			console.log(`選択された ${itemsToRestore.length} 個のアイテムを復元対象とします。`);
		} else if (mode === 'folder') {
			const folderName = target; // targetはフォルダ名のはず
			const folders = await eagle.folder.getAll();
			const targetFolder = folders.find(folder => folder.name === folderName);

			if (!targetFolder) {
				console.error(`復元対象フォルダ "${folderName}" が見つかりませんでした。`);
				eagle.log.error(`復元対象フォルダ "${folderName}" が見つかりませんでした。`);
				return { restoredCount, errorCount }; // フォルダが見つからない場合はエラー数を増やさず終了
			}
			console.log(`フォルダ "${folderName}" (ID: ${targetFolder.id}) 内のアイテムを取得します...`);
			itemsToRestore = await eagle.item.get({ folders: [targetFolder.id] });
			console.log(`フォルダ "${folderName}" 内で ${itemsToRestore.length} 個のアイテムが見つかりました。`);
		} else {
			console.error(`無効な復元モード: ${mode}`);
			return { restoredCount, errorCount };
		}

		if (!itemsToRestore || itemsToRestore.length === 0) {
			console.log("復元対象のアイテムが見つかりませんでした。");
			return { restoredCount, errorCount };
		}

		// 各アイテムに対して復元処理を実行
		for (const item of itemsToRestore) {
			const success = await restoreSingleItem(item);
			if (success) {
				restoredCount++;
			} else {
				errorCount++;
			}
		}
	} catch (error) {
		console.error(`restoreOriginalImages (${mode}) でエラー:`, error);
		eagle.log.error(`オリジナル復元処理中にエラーが発生しました: ${error.message || error}`);
		// ここでエラー数を増やすかは要検討 (個別のエラーはrestoreSingleItemでカウントされるため)
	}

	return { restoredCount, errorCount };
}

/**
 * 単一のアイテムをオリジナル画像で復元する
 * @param {object} item 復元対象のEagleアイテムオブジェクト
 * @returns {Promise<boolean>} 復元に成功した場合はtrue、失敗した場合はfalse
 */
async function restoreSingleItem(item) {
	if (!item || !item.filePath) {
		console.error("無効なアイテムまたはファイルパスがありません:", item);
		return false;
	}

	const filePath = item.filePath;
	const originalExt = path.extname(filePath);
	const originalFileName = path.basename(filePath, originalExt) + '_original' + originalExt;
	const originalFilePath = path.join(path.dirname(filePath), originalFileName);

	console.log(`アイテム "${item.name}" (ID: ${item.id}) の復元を試みます...`);
	console.log(`  オリジナルファイルパス候補: ${originalFilePath}`);

	try {
		// 1. オリジナルファイルが存在するか確認
		await fs.access(originalFilePath);
		console.log(`  オリジナルファイル発見: ${originalFilePath}`);

		// 2. ファイルを置き換え (復元)
		console.log(`  ${filePath} を ${originalFilePath} で置き換え中...`);
		await item.replaceFile(originalFilePath);
		console.log(`  ファイル置き換え成功。`);

		// 3. モザイクタグを削除 (設定されていれば)
		const mosaicTag = config.addTag; // configからモザイクタグ名を取得
		if (mosaicTag && item.tags.includes(mosaicTag)) {
			console.log(`  タグ "${mosaicTag}" を削除中...`);
			// item.tagsからmosaicTagを除外した新しい配列を作成
			item.tags = item.tags.filter(tag => tag !== mosaicTag);
			console.log(`  タグ削除後の配列: [${item.tags.join(', ')}]`);
		} else {
			console.log(`  タグ "${mosaicTag}" は存在しないか、設定されていません。`);
		}

		// 4. 変更を保存
		console.log(`  アイテム "${item.name}" の変更を保存中...`);
		await item.save();
		console.log(`  アイテム "${item.name}" の復元成功。`);

		// 5. オリジナルファイルを削除
		try {
			console.log(`  オリジナルファイル "${originalFilePath}" を削除中...`);
			await fs.unlink(originalFilePath);
			console.log(`  オリジナルファイル削除成功。`);
		} catch (unlinkError) {
			console.error(`  オリジナルファイル "${originalFilePath}" の削除に失敗しました:`, unlinkError);
			// 削除失敗は復元処理全体のエラーとはしないため、ログ出力のみ
			eagle.log.warn(`オリジナルファイル "${originalFileName}" の削除に失敗しました。`);
		}

		// 6. 連番形式のプレビューファイル (_preview[number].ext) を削除
		const baseName = path.basename(filePath, originalExt);
		const dirPath = path.dirname(filePath);
		// ベース名と拡張子を正規表現用にエスケープ
		const escapedBaseName = escapeRegex(baseName);
		const escapedExt = escapeRegex(originalExt);
		// _preview の後に数字が0個以上続くパターンにマッチする正規表現
		const previewFileRegex = new RegExp(`^${escapedBaseName}_preview\\d*${escapedExt}$`);
		console.log(`  プレビューファイル検索パターン: ${previewFileRegex}`);

		try {
			const filesInDir = await fs.readdir(dirPath);
			const previewFilesToDelete = filesInDir.filter(f => previewFileRegex.test(f));

			if (previewFilesToDelete.length > 0) {
				console.log(`  削除対象のプレビューファイル発見: ${previewFilesToDelete.join(', ')}`);
				for (const previewFile of previewFilesToDelete) {
					const previewFilePath = path.join(dirPath, previewFile);
					try {
						console.log(`    プレビューファイル "${previewFilePath}" を削除中...`);
						await fs.unlink(previewFilePath);
						console.log(`    プレビューファイル削除成功: ${previewFile}`);
					} catch (unlinkPreviewError) {
						console.error(`    プレビューファイル "${previewFilePath}" の削除に失敗しました:`, unlinkPreviewError);
						eagle.log.warn(`プレビューファイル "${previewFile}" の削除に失敗しました。`);
					}
				}
			} else {
				console.log(`  削除対象のプレビューファイルは見つかりませんでした。`);
			}
		} catch (readDirError) {
			console.error(`  ディレクトリ "${dirPath}" の読み込み中にエラーが発生しました:`, readDirError);
			eagle.log.error(`プレビューファイル検索中にディレクトリ読み込みエラーが発生しました。`);
		}

		return true; // 成功

	} catch (error) {
		// fs.access でファイルが見つからない場合のエラーコードは 'ENOENT'
		if (error.code === 'ENOENT') {
			console.log(`  オリジナルファイルが見つかりませんでした: ${originalFilePath} (スキップ)`);
		} else {
			console.error(`  アイテム "${item.name}" の復元中にエラーが発生しました:`, error);
			eagle.log.error(`アイテム "${item.name}" の復元エラー: ${error.message || error}`);
		}
		return false; // 失敗
	}
}

// 正規表現の特殊文字をエスケープするヘルパー関数
function escapeRegex(string) {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& はマッチした文字列全体を意味します
}


// プラグインのUIパネルが非表示になったときに呼ばれる
eagle.onPluginHide(() => {
	console.log('Mosaicing Images プラグイン非表示 (onPluginHide)');
});

// プラグインが終了する直前に呼ばれる
eagle.onPluginBeforeExit((event) => {
	console.log('Mosaicing Images プラグイン終了前 (onPluginBeforeExit)');
});
