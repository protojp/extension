eagle.onPluginCreate(async(plugin) => 
{
    console.log("!!START!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    const fs = require('fs');
    const path = require('path');
    const archiver = require('archiver');
    const Jimp = require('jimp');

    const startDate = new Date('2024-12-26');
    const endDate = new Date('2024-12-26');
	const addRequiredTags = ["yor forger"];//必須タグに追加するタグ Mimosa Vermillion
	const dateRange = 2;//日付をまたいだ場合などに1日以上の範囲を指定する際に使う。2だと2日分の範囲になる。

    const baseOutputFolder = 'E:\\SD_IMGS\\Discord';
    const watermarkPath = 'E:\\Dropbox\\@Watermark\\@proto_jp.png';
    const tileSize = 500;

    // 出力条件配列
    const outputImageTerms = [
		{
            suffix: "Lv3-sex",
            ratings: [3, 2, 1],
            maxImages: 36,
            requiredTags: ["nsfw","nude","1boy"],
            notTags: []
        },
		{
            suffix: "Lv3",
            ratings: [3, 2, 1],
            maxImages: 36,
            requiredTags: ["nsfw","nude"],
            notTags: ["1boy"]
        },
		{
            suffix: "Lv2-sex",
            ratings: [3, 2, 1],
            maxImages: 6,
            requiredTags: ["nsfw","nude","1boy"],
            notTags: []
        },
		{
            suffix: "Lv2-nude",
            ratings: [3, 2, 1],
            maxImages: 6,
            requiredTags: ["nsfw","nude"],
            notTags: ["1boy"]
        },
        {
            suffix: "Lv2",
            ratings: [3, 2, 1],
            maxImages: 25,
            requiredTags: [],
            notTags: ["nsfw"]
        },
        {
            suffix: "Lv1",
            ratings: [2, 1],
            maxImages: 4,
            requiredTags: [],
            notTags: ["nsfw"]
        }
		// {
        //     suffix: "Lv3",
        //     ratings: [3, 2, 1],
        //     maxImages: 25,
        //     requiredTags: ["kurokawa akane"],
        //     notTags: []
        // },
		// {
		// 	suffix: "Lv2",
		// 	ratings: [3, 2, 1],
		// 	maxImages: 25,
		// 	requiredTags: [],
		// 	notTags: ["nsfw"]
		// }
    ];

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

            const hasNotTags = notTags.length > 0 && 
                (item.tags && notTags.some(tag => item.tags.includes(tag)));

            if (
                targetRatings.includes(item.star) &&
                itemDate >= startDate &&
                itemDate < new Date(endDate.getTime() + 86400000*dateRange) &&
                imageWidth <= 4800 &&
                imageHeight <= 4800 &&
                hasRequiredTags &&
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

        const { outputFolder, outputPath, tiledImagePath } = createOutputPaths(dateString, suffix);

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
		// タイル画像の場合は名前に_tiledを追加
		const tiledSuffix = isTiled ? '_tiled' : '';
        const baseFileName = `${dateString}_${suffix}${tiledSuffix}`;

        const basePath = path.join(baseFolder, `${baseFileName}.${extension}`);
        if (!fs.existsSync(basePath)) {
            return basePath;
        }

        let counter = 1;
        let newPath;
        do {
            newPath = path.join(baseFolder, `${baseFileName}_${counter}.${extension}`);
            counter++;
        } while (fs.existsSync(newPath));

        return newPath;
    }

	function createOutputPaths(dateString, level) {
		const [year, month, day] = dateString.split('-');
		const outputFolder = path.join(baseOutputFolder, year, month);
	
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

	async function finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, jsonLevel) {
		archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });

		await archive.finalize();
		await closePromise;

		saveMetadata(metadata, outputFolder, dateString, jsonLevel);

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

	// 実行
	(async () => {
		try {
			await processImages();
		} catch (error) {
			console.error("プログラムの実行中にエラーが発生しました:", error);
		}
	})();


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////




	
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
