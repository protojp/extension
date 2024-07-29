
eagle.onPluginCreate(async(plugin) => 
{
	// console.log('eagle.onPluginCreate');
	// console.log(plugin);

	// document.querySelector('#message').innerHTML = `
	// テストテスト<br>
	// <ul>
	// 	<li>id: ${plugin.manifest.id}</li>
	// 	<li>version: ${plugin.manifest.version}</li>
	// 	<li>name: ${plugin.manifest.name}</li>
	// 	<li>logo: ${plugin.manifest.logo}</li>
	// 	<li>path: ${plugin.path}</li>
	// </ul>
	// `;

	console.log("!!START!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	// console.log(eagle);

	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	const fs = require('fs');
	const path = require('path');
	const archiver = require('archiver');
	const Jimp = require('jimp');

	const targetRatings = [3, 2];
	const startDate = new Date('2024-07-06'); // 開始日
	const endDate = new Date('2024-07-07'); // 終了日
	const baseOutputFolder = 'E:/SD_IMGS'; // 基本出力フォルダ
	const maxImages = 16; // 最大取得画像枚数
	const watermarkPath = 'E:\\Dropbox\\@Watermark\\@proto_jp.png';
	const tileSize = 500; // 各タイルの辺の長さ（ピクセル）

	// ウォーターマークの設定（デフォルト値）
	const watermarkConfig = {
		width: 300,
		height: 100,
		x: 'right',
		y: 'bottom',
		opacity: 0.8,
		marginX: 30,
		marginY: 20
	};

	async function processImages() {
		try {
			console.log("画像の取得を開始します...");
			const items = await eagle.item.get();
			console.log(`${items.length}個のアイテムを取得しました。`);

			const filteredItems = filterItems(items);
			console.log(`フィルタリング後のアイテム数: ${filteredItems.length}`);

			if (filteredItems.length === 0) {
				console.log('条件に合う画像が見つかりませんでした。');
				return;
			}

			if (!confirmProcessing(filteredItems.length)) {
				console.log('処理がキャンセルされました。');
				return;
			}

			const groupedItems = groupItemsByDate(filteredItems);
			console.log(`日付ごとのグループ数: ${Object.keys(groupedItems).length}`);

			for (const [dateString, dateItems] of Object.entries(groupedItems)) {
				console.log(`${dateString}の処理を開始します... (${dateItems.length}個のアイテム)`);
				await processDateItems(dateString, dateItems);
			}
			console.log("すべての処理が完了しました。");
		} catch (error) {
			console.error('エラーが発生しました:', error);
			console.error('エラーのスタックトレース:', error.stack);
		}
	}

	function filterItems(items) {
		const processedSeeds = new Set(); // 処理済みのseed値を追跡するためのSet

		return items.filter(item => {
			const itemDate = new Date(item.importedAt);
			const seed = getSeedFromAnnotation(item.annotation);

			if (
				targetRatings.includes(item.star) &&
				itemDate >= startDate &&
				itemDate < new Date(endDate.getTime() + 86400000)
			) {
				if (seed) {
					if (processedSeeds.has(seed)) {
						return false; // 既に処理済みのseed値なのでスキップ
					} else {
						processedSeeds.add(seed); // 新しいseed値を追加
						return true;
					}
				}
				return true; // seed値がない場合は常に含める
			}
			return false;
		});
	}

	function getSeedFromAnnotation(annotation) {
		if (!annotation) return null;
		const seedMatch = annotation.match(/Seed: (\d+)/);
		return seedMatch ? seedMatch[1] : null;
	}

	function confirmProcessing(itemCount) {
		const confirmMessage = `${itemCount}枚の画像を処理します。続行しますか？`;
		return confirm(confirmMessage);
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

	async function processDateItems(dateString, dateItems) {
		const selectedItems = selectItems(dateItems);
		const { outputFolder, outputPath, tiledImagePath } = createOutputPaths(dateString);
	
		createOutputFolder(outputFolder);
	
		const { archive, output, closePromise } = setupArchive(outputPath);
		const watermark = await setupWatermark();
	
		const { processedImages, metadata, tempFiles } = await processSelectedItems(selectedItems, watermark, outputFolder, archive);
	
		await createTiledImage(processedImages, tiledImagePath, metadata);
	
		await finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles);
	
		console.log(`処理された画像の数: ${selectedItems.length}`);
	}

	function selectItems(dateItems) {
		return dateItems.sort((a, b) => b.star - a.star).slice(0, maxImages);
	}

	function createOutputPaths(dateString) {
		const [year, month, day] = dateString.split('-');
		const outputFolder = path.join(baseOutputFolder, year, month);
		const outputFileName = dateString;
		const outputPath = path.join(outputFolder, `${outputFileName}.zip`);
		const tiledImagePath = path.join(outputFolder, `${outputFileName}_tiled.jpg`);
		return { outputFolder, outputPath, tiledImagePath };
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

	async function processSelectedItems(selectedItems, watermark, outputFolder, archive) {
		const processedImages = [];
		const tempFiles = []; // 一時ファイルのパスを追跡するための配列
		const metadata = initializeMetadata();
	
		for (let i = 0; i < selectedItems.length; i++) {
			try {
				const item = selectedItems[i];
				const { filePath, newFileName, image, tempFilePath } = await processSingleItem(item, i, watermark, outputFolder);
	
				archive.file(filePath, { name: newFileName });
	
				processedImages.push(image);
				metadata.images.push(extractImageMetadata(item, newFileName, image));
	
				tempFiles.push(tempFilePath); // 一時ファイルのパスを保存
			} catch (error) {
				console.error("エラーが発生しました:", error);
			}
		}
		return { processedImages, metadata, tempFiles }; // tempFiles を返す
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

	function extractImageMetadata(item, newFileName, image) {
		return {
			filename: newFileName,
			width: image.getWidth(),
			height: image.getHeight(),
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

	async function finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles) {
		archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });
	
		await archive.finalize();
		await closePromise;
	
		saveMetadata(metadata, outputFolder, dateString);
	
		console.log(`ZIPファイルが正常に保存されました: ${output.path}`);
		console.log(`タイル状の画像が保存されました: ${tiledImagePath}`);
	
		removeTempFiles(tempFiles);
	}

	function saveMetadata(metadata, outputFolder, dateString) {
		const metadataPath = path.join(outputFolder, `${dateString}.json`);
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		console.log(`メタデータJSONファイルが保存されました: ${metadataPath}`);
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
