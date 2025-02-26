eagle.onPluginCreate(async(plugin) => 
{
    console.log("!!START!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    const fs = require('fs');
    const archiver = require('archiver');
    const Jimp = require('jimp');
	const path = require('path');
	const { execFile } = require('child_process');

    let startDate, endDate, addRequiredTags, dateRange, output1stFolderName, baseOutputFolder, watermarkPath, tileSize, pythonPath, updateTagsPy;

    const outputImageTerms = [
		{
            suffix: "Lv3-sex",
            ratings: [3, 2, 1],
            maxImages: 36,
            requiredTags: ["nsfw","nude","sex"],
            notTags: []
        }
		,{
            suffix: "Lv3",
            ratings: [3, 2, 1],
            maxImages: 36,
            requiredTags: ["nsfw","nude"],
            notTags: ["sex"]
        }
		,
		{
            suffix: "Lv2-sex",
            ratings: [3, 2, 1],
            maxImages: 6,
            requiredTags: ["nsfw","nude","sex"],
            notTags: []
        }
		,{
            suffix: "Lv2-nude",
            ratings: [3, 2, 1],
            maxImages: 6,
            requiredTags: ["nsfw","nude"],
            notTags: ["sex"]
        }
        ,
		{
            suffix: "Lv2",
            ratings: [3, 2, 1],
            maxImages: 25,
            requiredTags: [],
            notTags: ["nsfw"]
        }
        ,
		{
            suffix: "Lv1",
            ratings: [2, 1],
            maxImages: 4,
            requiredTags: [],
            notTags: ["nsfw"]
        }
    ];
	
	const folders = await eagle.folder.getAll();// すべてのフォルダを取得

    const watermarkConfig = {
        width: 300,
        height: 100,
        x: 'right',
        y: 'bottom',
        opacity: 0.8,
        marginX: 30,
        marginY: 20
    };

	function addRequiredTagsToTerms(outputTerms, tagsToAdd) {
		// tagsToAddが空配列または未定義の場合は何もしない
		if (!tagsToAdd || tagsToAdd.length === 0) {
			return;
		}
	
		// 各要素のrequiredTagsに新しいタグを追加
		outputTerms.forEach(term => {
			term.requiredTags.push(...tagsToAdd);
		});
	}
	addRequiredTagsToTerms(outputImageTerms, addRequiredTags);

    async function processImages() {
        try {
            console.log("画像の取得を開始します...");
            const items = await eagle.item.get();
            console.log(`${items.length}個のアイテムを取得しました。`);

            const processedSeeds = new Set();

            for (const term of outputImageTerms) {
                const filteredItems = filterItems(items, term.ratings, term.requiredTags, term.notTags, processedSeeds);
                console.log(`${term.suffix}フィルタリング後のアイテム数: ${filteredItems.length}`);

                if (filteredItems.length > 0) {
                    const groupedItems = groupItemsByDate(filteredItems);
                    for (const [dateString, dateItems] of Object.entries(groupedItems)) {
                        console.log(`${term.suffix}: ${dateString}の処理を開始します... (${dateItems.length}個のアイテム)`);
                        await processDateItems(dateString, dateItems, term.suffix, term.maxImages, processedSeeds);
                    }
                }
            }

            console.log("すべての処理が完了しました。");
        } catch (error) {
            console.error('エラーが発生しました:', error);
            console.error('エラーのスタックトレース:', error.stack);
        }
    }

    function filterItems(items, targetRatings, requiredTags, notTags, processedSeeds) {
        return items.filter(item => {
            const itemDate = new Date(item.importedAt);
            const seed = getSeedFromAnnotation(item.annotation);

            const imageWidth = item.width;
            const imageHeight = item.height;

            const hasRequiredTags = requiredTags.length === 0 || 
                (item.tags && requiredTags.every(tag => item.tags.includes(tag)));

            const hasAddRequiredTags = addRequiredTags.length === 0 || 
                (item.tags && addRequiredTags.every(tag => item.tags.includes(tag)));

            const hasNotTags = notTags.length > 0 && 
                (item.tags && notTags.some(tag => item.tags.includes(tag)));

            if (
                targetRatings.includes(item.star) &&
                itemDate >= startDate &&
                itemDate < new Date(endDate.getTime() + 86400000*dateRange) &&
                imageWidth <= 4800 &&
                imageHeight <= 4800 &&
                hasRequiredTags &&
                hasAddRequiredTags &&
                !hasNotTags
            ) {
                if (seed) {
                    if (processedSeeds.has(seed)) {
                        return false;
                    } else {
                        return true;
                    }
                }
                return true;
            }
            return false;
        });
    }

    function getSeedFromAnnotation(annotation) {
        if (!annotation) return null;
        const seedMatch = annotation.match(/Seed: (\d+)/);
        return seedMatch ? seedMatch[1] : null;
    }

    function groupItemsByDate(items) {
        return items.reduce((acc, item) => {
            const date = new Date(item.importedAt);
            const dateString = date.toISOString().split('T')[0];
            if (!acc[dateString]) {
                acc[dateString] = [];
            }
            acc[dateString].push(item);
            return acc;
        }, {});
    }

    async function processDateItems(dateString, dateItems, suffix, maxImages, processedSeeds) {
        const selectedItems = selectItems(dateItems, maxImages, processedSeeds);

        const targetFolder = await getTargetFolder();
        const { outputFolder, outputPath, tiledImagePath } = createOutputPaths(dateString, suffix, selectedItems, targetFolder);

        createOutputFolder(outputFolder);

        const { archive, output, closePromise } = setupArchive(outputPath);
        const watermark = await setupWatermark();

        const { processedImages, metadata, tempFiles } = await processSelectedItems(selectedItems, watermark, outputFolder, archive, processedSeeds);

        await createTiledImage(processedImages, tiledImagePath, metadata);

        await finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, suffix);

        console.log(`${suffix}: 処理された画像の数: ${selectedItems.length}`);
    }

    function finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, suffix) {
        archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });

        const metadataPath = generateUniqueFilePath(outputFolder, dateString, suffix, 'json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log(`メタデータJSONファイルが保存されました: ${metadataPath}`);

        removeTempFiles(tempFiles);
    }

	function selectItems(dateItems, maxImages, processedSeeds) {
		// 重複するseedを持つアイテムを除外
		const uniqueItems = dateItems.filter(item => {
			const seed = getSeedFromAnnotation(item.annotation);
			return !(seed && processedSeeds.has(seed));
		});

		// アイテムをランダムにシャッフル
		for (let i = uniqueItems.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[uniqueItems[i], uniqueItems[j]] = [uniqueItems[j], uniqueItems[i]];
		}

		// 指定された最大数のアイテムを選択
		const selectedItems = uniqueItems.slice(0, maxImages);

		return selectedItems;
	}

	function generateUniqueFilePath(baseFolder, dateString, suffix, extension, isTiled = false) {
		const tiledSuffix = isTiled ? '_tiled' : '';
		
		// 基本のファイル名を生成（カウンターなし）
		const baseFileName = `${dateString}_${suffix}`;
		const basePath = path.join(baseFolder, `${baseFileName}${tiledSuffix}.${extension}`);
		
		// ファイルが存在しない場合は基本パスを返す
		if (!fs.existsSync(basePath)) {
			return basePath;
		}
		
		// ファイルが存在する場合はカウンターを追加
		let counter = 1;
		let newPath;
		do {
			// isTiledの場合は${counter}${tiledSuffix}.${extension}の順
			if (isTiled) {
				newPath = path.join(baseFolder, `${baseFileName}_${counter}${tiledSuffix}.${extension}`);
			} else {
				newPath = path.join(baseFolder, `${baseFileName}${tiledSuffix}_${counter}.${extension}`);
			}
			counter++;
		} while (fs.existsSync(newPath));
		
		return newPath;
	}

	function createOutputPaths(dateString, level, selectedItems, targetFolder) {
		const [year, month, day] = dateString.split('-');
		let outputFolder = path.join(baseOutputFolder, year, month);
		
		// 条件に基づいて "_Uncensored" を追加
		if (selectedItems.some(item => 
			item.folders.includes(targetFolder.id) && 
			item.tags.includes("nsfw"))) {
			outputFolder = path.join(outputFolder, "_Uncensored");
		}
	
		const outputPath = generateUniqueFilePath(outputFolder, dateString, level, 'zip');
		const tiledImagePath = generateUniqueFilePath(outputFolder, dateString, level, 'jpg', true);
	
		return { 
			outputFolder, 
			outputPath, 
			tiledImagePath, 
			fileNameSuffix: path.basename(outputPath, '.zip').split('_')[1] || '' 
		};
	}	

	function createOutputFolder(outputFolder) {
		if (!fs.existsSync(outputFolder)) {
			fs.mkdirSync(outputFolder, { recursive: true });
		}
	}

	function setupArchive(outputPath) {
		const output = fs.createWriteStream(outputPath);
		const archive = archiver('zip', { zlib: { level: 9 } });

		const closePromise = new Promise((resolve, reject) => {
			output.on('close', resolve);
			archive.on('error', reject);
		});

		archive.pipe(output);
		return { archive, output, closePromise };
	}

	async function setupWatermark() {
		const watermark = await Jimp.read(watermarkPath);
		watermark.resize(watermarkConfig.width, watermarkConfig.height);
		watermark.opacity(watermarkConfig.opacity);
		return watermark;
	}

	async function processSelectedItems(selectedItems, watermark, outputFolder, archive, processedSeeds) {
		const processedImages = [];
		const tempFiles = [];
		const metadata = initializeMetadata();

		for (let i = 0; i < selectedItems.length; i++) {
			try {
				const item = selectedItems[i];
				const seed = getSeedFromAnnotation(item.annotation);
	
				const { filePath, newFileName, image, tempFilePath, originalWidth, originalHeight } = await processSingleItem(item, i, watermark, outputFolder);

				archive.file(filePath, { name: newFileName });

				processedImages.push(image);
				metadata.images.push(extractImageMetadata(item, newFileName, originalWidth, originalHeight));

				tempFiles.push(tempFilePath);

				if (seed) {
					processedSeeds.add(seed); // 処理したseedを追加
				}
			} catch (error) {
				console.error("エラーが発生しました:", error);
			}
		}
		return { processedImages, metadata, tempFiles };
	}

	function initializeMetadata() {
		return {
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			description: "",
			tags: [],
			stats: null,
			thumbnail: {
				filename: "thumbnail.jpg",
				metadata: {
					size: 0,
					width: 0,
					height: 0
				}
			},
			images: []
		};
	}

	async function processSingleItem(item, index, watermark, outputFolder) {
		const filePath = item.filePath;
		const seed = getSeedFromAnnotation(item.annotation);
		const newFileName = generateFileName(index, seed, item.star);
	
		const image = await Jimp.read(filePath);
		const originalWidth = image.getWidth();
		const originalHeight = image.getHeight();
	
		addWatermark(image, watermark);
	
		const tempFilePath = path.join(outputFolder, `temp_${Date.now()}_${newFileName}`);
		await image.quality(90).writeAsync(tempFilePath);
	
		const croppedImage = cropAndResizeImage(image);
	
		return { filePath: tempFilePath, newFileName, image: croppedImage, originalWidth, originalHeight, tempFilePath };
	}

	function generateFileName(index, seed, star) {
		if (seed) {
			return `${(index + 1).toString().padStart(3, '0')}_${seed}.jpg`;
		} else {
			return `${(index + 1).toString().padStart(3, '0')}_rate${star}.jpg`;
		}
	}

	function addWatermark(image, watermark) {
		const x = image.getWidth() - watermark.getWidth() - watermarkConfig.marginX;
		const y = image.getHeight() - watermark.getHeight() - watermarkConfig.marginY;
		image.composite(watermark, x, y, {
			mode: Jimp.BLEND_SOURCE_OVER,
			opacitySource: watermarkConfig.opacity
		});
	}

	function cropAndResizeImage(image) {
		const size = Math.min(image.getWidth(), image.getHeight());
		image.crop(
			(image.getWidth() - size) / 2,
			(image.getHeight() - size) / 2,
			size,
			size
		);

		image.resize(tileSize, tileSize);
		return image;
	}

	function extractImageMetadata(item, newFileName, originalWidth, originalHeight) {
		return {
			filename: newFileName,
			width: originalWidth,
			height: originalHeight,
			meta: parseMetadata(item.annotation || "")
		};
	}

	function parseMetadata(text) {
		const extractValue = (text, key) => {
			const regex = new RegExp(`${key}: (.*?)(?=, (?:[A-Z]|ADetailer)|$)`, 's');
			const match = text.match(regex);
			return match ? match[1].trim() : null;
		};

		const isADetailer = text.includes('ADetailer model:');

		let outputJson = {};

		if (isADetailer) {
			const aDetailerFields = [
				'model', 'prompt', 'negative prompt', 'confidence', 'dilate erode',
				'mask blur', 'denoising strength', 'inpaint only masked',
				'inpaint padding', 'use separate VAE', 'VAE', 'version'
			];

			outputJson = {
				Steps: parseInt(extractValue(text, 'Steps'), 10),
				Sampler: extractValue(text, 'Sampler'),
				Schedule_type: extractValue(text, 'Schedule type'),
				CFG_scale: parseFloat(extractValue(text, 'CFG scale')),
				Seed: parseInt(extractValue(text, 'Seed'), 10),
				Size: extractValue(text, 'Size'),
				Model: extractValue(text, 'Model'),
				VAE_hash: extractValue(text, 'VAE hash'),
				VAE: extractValue(text, 'VAE'),
				Denoising_strength: parseFloat(extractValue(text, 'Denoising strength')),
				Clip_skip: parseInt(extractValue(text, 'Clip skip'), 10),
				Noise_multiplier: parseFloat(extractValue(text, 'Noise multiplier')),
				Version: extractValue(text, 'Version'),
				ADetailer: {}
			};

			aDetailerFields.forEach(field => {
				const value = extractValue(text, `ADetailer ${field}`);
				if (value !== null) {
					let key = field.replace(/ /g, '_');
					if (field === 'inpaint only masked' || field === 'use separate VAE') {
						outputJson.ADetailer[key] = value === 'True';
					} else if (['confidence', 'denoising strength'].includes(field)) {
						outputJson.ADetailer[key] = parseFloat(value);
					} else if (['dilate erode', 'mask blur', 'inpaint padding'].includes(field)) {
						outputJson.ADetailer[key] = parseInt(value, 10);
					} else {
						outputJson.ADetailer[key] = value;
					}
				}
			});
		} else {
			const promptParts = text.split('Negative prompt:');
			const prompt = promptParts[0].trim();
			const negativePromptParts = (promptParts[1] || '').split('Steps:');
			const negativePrompt = negativePromptParts[0].trim();

			let loraHashesObject = {};
			const loraHashesMatch = text.match(/Lora hashes: (.+?(?=, Version:|$))/);
			if (loraHashesMatch) {
				const loraHashes = loraHashesMatch[1].trim();
				loraHashesObject = loraHashes.replace(/"/g, '').split(', ').reduce((acc, hash) => {
					const [key, value] = hash.split(': ');
					acc[key] = value;
					return acc;
				}, {});
			}

			outputJson = {
				prompt: prompt,
				Negative_prompt: negativePrompt,
				Steps: parseInt(extractValue(text, 'Steps'), 10),
				Sampler: extractValue(text, 'Sampler'),
				Schedule_type: extractValue(text, 'Schedule type'),
				CFG_scale: parseFloat(extractValue(text, 'CFG scale')),
				Seed: parseInt(extractValue(text, 'Seed'), 10),
				Size: extractValue(text, 'Size'),
				Model: extractValue(text, 'Model'),
				VAE_hash: extractValue(text, 'VAE hash'),
				VAE: extractValue(text, 'VAE'),
				Variation_seed: parseInt(extractValue(text, 'Variation seed'), 10),
				Variation_seed_strength: parseFloat(extractValue(text, 'Variation seed strength')),
				Denoising_strength: parseFloat(extractValue(text, 'Denoising strength')),
				Clip_skip: parseInt(extractValue(text, 'Clip skip'), 10),
				ENSD: parseInt(extractValue(text, 'ENSD'), 10),
				Hires_upscale: parseFloat(extractValue(text, 'Hires upscale')),
				Hires_steps: parseInt(extractValue(text, 'Hires steps'), 10),
				Hires_upscaler: extractValue(text, 'Hires upscaler'),
				Lora_hashes: loraHashesObject,
				Version: extractValue(text, 'Version')
			};
		}

		return outputJson;
	}

	async function createTiledImage(processedImages, tiledImagePath, metadata) {
		const tilesPerRow = Math.ceil(Math.sqrt(processedImages.length));
		const tiledImage = new Jimp(tileSize * tilesPerRow, tileSize * tilesPerRow, 0xFFFFFFFF);

		processedImages.forEach((image, index) => {
			const x = (index % tilesPerRow) * tileSize;
			const y = Math.floor(index / tilesPerRow) * tileSize;
			tiledImage.composite(image, x, y);
		});

		metadata.thumbnail.metadata = {
			size: tiledImage.bitmap.data.length,
			width: tiledImage.bitmap.width,
			height: tiledImage.bitmap.height
		};

		await tiledImage.quality(90).writeAsync(tiledImagePath);
	}

	async function runPythonScript(jsonPath) {
		try {
			const args = ['--file', jsonPath];
			const { stdout, stderr } = await new Promise((resolve, reject) => {
				execFile(pythonPath, [updateTagsPy, ...args], {
					cwd: path.dirname(updateTagsPy)
				}, (error, stdout, stderr) => {
					if (error) {
						reject({ error, stdout, stderr });
					} else {
						resolve({ stdout, stderr });
					}
				});
			});
	
			if (stdout) console.log('Python出力:', stdout);
			if (stderr) console.error('Pythonエラー:', stderr);
		} catch (error) {
			console.error('Pythonスクリプト実行エラー:', error);
			throw error;
		}
	}

	async function finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, jsonLevel) {
		archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });

		await archive.finalize();
		await closePromise;

		const metadataPath = await saveMetadata(metadata, outputFolder, dateString, jsonLevel);
        await runPythonScript(metadataPath);

		console.log(`ZIPファイルが正常に保存されました: ${output.path}`);
		console.log(`タイル状の画像が保存されました: ${tiledImagePath}`);

		removeTempFiles(tempFiles);
	}

	function saveMetadata(metadata, outputFolder, dateString, jsonLevel) {
		const metadataPath = generateUniqueFilePath(outputFolder, dateString, jsonLevel, 'json');
	
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		console.log(`メタデータJSONファイルが保存されました: ${metadataPath}`);
		return metadataPath;
	}

	function removeTempFiles(tempFiles) {
		if (Array.isArray(tempFiles)) {
			tempFiles.forEach(tempFilePath => {
				try {
					if (fs.existsSync(tempFilePath)) {
						fs.unlinkSync(tempFilePath);
						console.log(`一時ファイルを削除しました: ${tempFilePath}`);
					}
				} catch (err) {
					console.warn(`一時ファイルの削除に失敗しました: ${tempFilePath}`, err);
				}
			});
		} else {
			console.warn("一時ファイルが見つかりませんでした。");
		}
	}

	// グローバル変数の初期化
	const initializeVariables = async () => {
        output1stFolderName = "1stOutputWebUI";//生成時出力フォルダ。処理終了の判定に使う。
        baseOutputFolder = 'E:\\SD_IMGS\\Discord';
        watermarkPath = 'E:\\Dropbox\\@Watermark\\@proto_jp.png';
        tileSize = 500;
        dateRange = 1;//※イマイチ想定通り動かない？日付別にファイルが生成される。日付をまたいだ場合などに1日以上の範囲を指定する際に使う。2だと2日分の範囲になる。
        pythonPath = 'C:\\github\\protojp\\sns\\myvenv\\Scripts\\python.exe';
        updateTagsPy = 'C:\\github\\protojp\\sns\\upload\\update_json_tags.py';
    };

    // 出力フォルダを取得
    const getTargetFolder = async () => {
        const folders = await eagle.folder.getAll();
        const targetFolder = folders.find(folder => folder.name === output1stFolderName);
        if (!targetFolder) {
            throw new Error(`フォルダ '${output1stFolderName}' が見つかりません`);
        }
        return targetFolder;
    };

    // UIから実行される関数
    async function startProcess() {
        const button = document.getElementById('startButton');
        button.disabled = true; // ボタンを無効化
        try {
            // 変数の初期化
            await initializeVariables();

            // 入力値を取得
            startDate = new Date(document.getElementById('startDate').value);
            endDate = new Date(document.getElementById('endDate').value);
            
            // タグを配列に変換（カンマで区切って、空白を削除）
            const tagsInput = document.getElementById('requiredTags').value;
            addRequiredTags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== '');

            // 入力値の検証
            if (!startDate || !endDate) {
                document.getElementById('message').textContent = '日付を入力してください';
                return;
            }

            if (startDate > endDate) {
                document.getElementById('message').textContent = '開始日は終了日より前である必要があります';
                return;
            }

            document.getElementById('message').textContent = '処理を開始しました...';
            
            await processImages();
            document.getElementById('message').textContent = '処理が完了しました！';
        } catch (error) {
            document.getElementById('message').textContent = 'エラーが発生しました: ' + error.message;
            console.error("プログラムの実行中にエラーが発生しました:", error);
        } finally {
            button.disabled = false; // 処理完了後にボタンを有効化
        }
    }

    // 画像処理のメイン関数を修正
    async function processImages() {
        const targetFolder = await getTargetFolder();
        try {
            console.log("画像の取得を開始します...");
            const items = await eagle.item.get();
            console.log(`${items.length}個のアイテムを取得しました。`);

            const processedSeeds = new Set();

            for (const term of outputImageTerms) {
                const filteredItems = filterItems(items, term.ratings, term.requiredTags, term.notTags, processedSeeds);
                console.log(`${term.suffix}フィルタリング後のアイテム数: ${filteredItems.length}`);

                if (filteredItems.length > 0) {
                    const groupedItems = groupItemsByDate(filteredItems);
                    for (const [dateString, dateItems] of Object.entries(groupedItems)) {
                        console.log(`${term.suffix}: ${dateString}の処理を開始します... (${dateItems.length}個のアイテム)`);
                        await processDateItems(dateString, dateItems, term.suffix, term.maxImages, processedSeeds);
                    }
                }
            }

            console.log("すべての処理が完了しました。");
        } catch (error) {
            console.error('エラーが発生しました:', error);
            console.error('エラーのスタックトレース:', error.stack);
        }
    }
    
// デフォルト値を設定
const setDefaultDates = () => {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);

    // YYYY-MM-DD形式に変換
    const formatDate = (date) => {
        return date.toISOString().split('T')[0];
    };

    document.getElementById('endDate').value = formatDate(today);
    document.getElementById('startDate').value = formatDate(oneWeekAgo);
};

	// すべてのイベントハンドラを一箇所にまとめる
	const setupEventHandlers = () => {
		// 実行ボタンのイベントハンドラ
		document.getElementById('startButton').addEventListener('click', startProcess);
		
		// ペーストハンドラの設定
		const requiredTagsInput = document.getElementById('requiredTags');
		if (requiredTagsInput) {
			// 標準的なペーストイベントリスナーの代わりに、inputイベントを使用
			requiredTagsInput.addEventListener('input', function(e) {
				// 二重入力を検出して修正する
				const inputText = this.value;
				// テキストの後半が前半と同じパターンを持つか確認
				const halfLength = Math.floor(inputText.length / 2);
				if (halfLength > 0 && inputText.length % 2 === 0) {
					const firstHalf = inputText.substring(0, halfLength);
					const secondHalf = inputText.substring(halfLength);
					
					if (firstHalf === secondHalf) {
						// 二重入力を検出したら、後半を削除
						this.value = firstHalf;
						// カーソル位置を最後に設定
						this.selectionStart = this.selectionEnd = firstHalf.length;
					}
				}
			});
			
			// フォーカスを得たときにもチェック
			requiredTagsInput.addEventListener('focus', function(e) {
				// 既存の内容が二重になっていないか確認
				const inputText = this.value;
				const halfLength = Math.floor(inputText.length / 2);
				if (halfLength > 0 && inputText.length % 2 === 0) {
					const firstHalf = inputText.substring(0, halfLength);
					const secondHalf = inputText.substring(halfLength);
					
					if (firstHalf === secondHalf) {
						this.value = firstHalf;
					}
				}
			});
		}
	};

	setDefaultDates();
	setupEventHandlers();
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
