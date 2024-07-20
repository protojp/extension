
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


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


	const targetRatings = [3, 2];
	const targetDate = new Date('2024-07-03');
	const outputFolder = 'D:/Download';
	const maxImages = 9;
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
	
		const outputFileName = `images_${new Date().toISOString().replace(/[:.]/g, '-')}`;
		const outputPath = path.join(outputFolder, `${outputFileName}.zip`);
		const tiledImagePath = path.join(outputFolder, `${outputFileName}_tiled.jpg`);
	
		const output = fs.createWriteStream(outputPath);
		const archive = archiver('zip', { zlib: { level: 9 } });
	
		const closePromise = new Promise((resolve, reject) => {
			output.on('close', resolve);
			archive.on('error', reject);
		});
	
		archive.pipe(output);
	
		const watermark = await Jimp.read(watermarkPath);
		watermark.resize(watermarkConfig.width, watermarkConfig.height);
		watermark.opacity(watermarkConfig.opacity);
	
		const processedImages = [];
		const tempFiles = [];
		const metadata = {
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			description: "",
			tags: [],
			stats: null,
			thumbnail: {
				filename: "thumbnail.jpg",
				metadata: {
					size: 0,  // 後で更新
					width: 0, // 後で更新
					height: 0 // 後で更新
				}
			},
			images: []
		};
		
		for (let i = 0; i < filteredItems.length; i++) {
			try {
				const item = filteredItems[i];
				const filePath = item.filePath;
				const itemDate = new Date(item.importedAt);
				const formattedDate = itemDate.toISOString().split('T')[0];
				const newFileName = `${formattedDate}_${(i + 1).toString().padStart(3, '0')}_rate${item.star}.jpg`;
		
				const image = await Jimp.read(filePath);
				
				// 元の画像にウォーターマークを追加
				let x = image.getWidth() - watermark.getWidth() - watermarkConfig.marginX;
				let y = image.getHeight() - watermark.getHeight() - watermarkConfig.marginY;
				image.composite(watermark, x, y, {
					mode: Jimp.BLEND_SOURCE_OVER,
					opacitySource: watermarkConfig.opacity
				});
		
				// 元の画像を保存
				const tempFilePath = path.join(outputFolder, `temp_${Date.now()}_${newFileName}`);
				await image.quality(90).writeAsync(tempFilePath);
				tempFiles.push(tempFilePath);
				archive.file(tempFilePath, { name: newFileName });
		
				// タイル用に画像を正方形にトリミング
				const size = Math.min(image.getWidth(), image.getHeight());
				image.crop(
					(image.getWidth() - size) / 2,
					(image.getHeight() - size) / 2,
					size,
					size
				);
		
				// 画像をリサイズ
				image.resize(tileSize, tileSize);
		
				processedImages.push(image);

				const imageMetadata = {
					filename: newFileName,
					width: image.bitmap.width,
					height: image.bitmap.height,
					meta: parseMetadata(item.annotation || "")
				};
				metadata.images.push(imageMetadata);

			} catch (error) {
				console.error("エラーが発生しました:", error);
			  }
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
		
		// タイル状の画像を作成
		const tilesPerRow = Math.ceil(Math.sqrt(processedImages.length));
		const tiledImage = new Jimp(tileSize * tilesPerRow, tileSize * tilesPerRow, 0xFFFFFFFF);
		
		processedImages.forEach((image, index) => {
			const x = (index % tilesPerRow) * tileSize;
			const y = Math.floor(index / tilesPerRow) * tileSize;
			tiledImage.composite(image, x, y);
		});
		
		// サムネイルのメタデータを更新
		metadata.thumbnail.metadata = {
			size: tiledImage.bitmap.data.length,
			width: tiledImage.bitmap.width,
			height: tiledImage.bitmap.height
		};
		
		// メタデータJSONファイルの保存
		const metadataPath = path.join(outputFolder, `${outputFileName}.json`);
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
		
		console.log(`メタデータJSONファイルが保存されました: ${metadataPath}`);
	
		// タイル状の画像を保存
		await tiledImage.quality(90).writeAsync(tiledImagePath);
	
		// タイル状の画像をZIPに追加
		archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });
	
		await archive.finalize();
		await closePromise;
	
		console.log(`ZIPファイルが正常に保存されました: ${outputPath}`);
		console.log(`タイル状の画像が保存されました: ${tiledImagePath}`);
		console.log(`処理された画像の数: ${filteredItems.length}`);
	
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