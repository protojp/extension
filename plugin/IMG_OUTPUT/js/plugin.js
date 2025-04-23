// ログ出力用のユーティリティ（グローバルスコープで定義）
const Logger = {
    // ログレベル
    levels: {
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error'
    },
    
    // ログをHTMLに追加
    log(message, level = 'info') {
        // コンソールにも出力
        console.log(`[Logger] ${level}: ${message}`);
        
        try {
            // DOMが読み込まれているか確認
            if (document.readyState === 'loading') {
                console.log('[Logger] DOMが読み込み中 - イベントリスナーを追加');
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('[Logger] DOMContentLoadedイベント発火 - ログを追加');
                    this.appendLogToHTML(message, level);
                });
            } else {
                console.log('[Logger] DOMが読み込み済み - 直接ログを追加');
                this.appendLogToHTML(message, level);
            }
        } catch (error) {
            console.error('[Logger] ログ追加中にエラー:', error);
        }
    },
    
    // HTMLにログを追加
    appendLogToHTML(message, level) {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        
        const logTime = document.createElement('span');
        logTime.className = 'log-time';
        logTime.textContent = `[${timeString}] `;
        
        const logMessage = document.createElement('span');
        logMessage.textContent = message;
        
        logEntry.appendChild(logTime);
        logEntry.appendChild(logMessage);
        
        logContent.appendChild(logEntry);
        
        // 自動スクロール
        document.querySelector("#log-content").scrollIntoView(false);
    },

    // 情報ログ
    info(message) {
        this.log(message, this.levels.INFO);
    },
    
    // 警告ログ
    warning(message) {
        this.log(message, this.levels.WARNING);
    },
    
    // エラーログ
    error(message) {
        this.log(message, this.levels.ERROR);
    },
    
    // ログをクリア
    clear() {
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }
    }
};

// プラグイン初期化処理
eagle.onPluginCreate(async(plugin) => {
    Logger.info("プラグインを初期化しています...");

    const fs = require('fs');
    const archiver = require('archiver');
    const Jimp = require('jimp');
    const path = require('path');
    const { execFile } = require('child_process');

    // 設定管理モジュール
    const ConfigManager = {
        config: null,
        settings: null,
        outputImageTerms: null,

        // 設定を読み込む
        async loadConfig() {
            try {
                const configPath = path.join(__dirname, 'js/config.json');
                // Logger.info(`設定ファイルの完全パス: ${path.resolve(configPath)}`);
                // Logger.info(`カレントディレクトリ: ${process.cwd()}`);
                // Logger.info(`__dirnameの値: ${__dirname}`);
                
                // ファイル存在チェック
                const fileExists = fs.existsSync(configPath);
                // Logger.info(`ファイル存在状態: ${fileExists}`);
                
                if (!fileExists) {
                    Logger.error(`設定ファイルが見つかりません: ${configPath}`);
                    return false;
                }
                
                // ファイルアクセス権チェック
                try {
                    fs.accessSync(configPath, fs.constants.R_OK);
                    // Logger.info(`ファイル読み込み権限があります`);
                } catch (err) {
                    Logger.error(`ファイル読み込み権限がありません: ${err.message}`);
                    return false;
                }
                
                const configData = fs.readFileSync(configPath, 'utf8');
                // Logger.info(`設定ファイルの内容: ${configData.length} bytes (最初の50文字: ${configData.substring(0, 50)}...)`);
                
                this.config = JSON.parse(configData);
                this.outputImageTerms = this.config.outputImageTerms;
                this.settings = this.config.defaultSettings;
                
                Logger.info(`設定ファイルを正常に読み込みました。${this.outputImageTerms.length}個の出力条件を読み込み`);
                return true;
            } catch (error) {
                Logger.error(`設定ファイルの読み込みに失敗しました: ${error.message}`);
                // Logger.error(`スタックトレース: ${error.stack}`);
                return false;
            }
        }
    };

    // 画像処理モジュール
    const ImageProcessor = {
        startDate: null,
        endDate: null,
        processedSeeds: new Set(),

        // 画像処理のメイン関数
        async processImages(termsToProcess, addRequiredTags) { // 引数を追加
            try {
                Logger.info("画像の取得を開始します...");
                const items = await eagle.item.get();
                Logger.info(`${items.length}個のアイテムを取得しました。`);

                this.processedSeeds.clear();

                for (const term of termsToProcess) { // 引数を使用
                    const filteredItems = this.filterItems(items, term.ratings, term.requiredTags, term.notTags, addRequiredTags); // addRequiredTagsを渡す
                    Logger.info(`${term.suffix}フィルタリング後のアイテム数: ${filteredItems.length}`);

                    if (filteredItems.length > 0) {
                        const groupedItems = this.groupItemsByDate(filteredItems);
                        for (const [dateString, dateItems] of Object.entries(groupedItems)) {
                            Logger.info(`${term.suffix}: ${dateString}の処理を開始します... (${dateItems.length}個のアイテム)`);
                            await this.processDateItems(dateString, dateItems, term.suffix, term.maxImages);
                        }
                    }
                }

                Logger.info("すべての処理が完了しました。");
            } catch (error) {
                Logger.error(`エラーが発生しました: ${error.message}`);
                Logger.error(`エラーのスタックトレース: ${error.stack}`);
            }
        },

        // アイテムをフィルタリング
        filterItems(items, targetRatings, requiredTags, notTags, addRequiredTags) { // 引数を追加
            return items.filter(item => {
                const itemDate = new Date(item.importedAt);
                const seed = this.getSeedFromAnnotation(item.annotation);

                const imageWidth = item.width;
                const imageHeight = item.height;

                const hasRequiredTags = requiredTags.length === 0 || 
                    (item.tags && requiredTags.every(tag => item.tags.includes(tag)));

                const hasAddRequiredTags = addRequiredTags.length === 0 || // 引数を使用
                    (item.tags && addRequiredTags.every(tag => item.tags.includes(tag))); // 引数を使用

                const hasNotTags = notTags.length > 0 && 
                    (item.tags && notTags.some(tag => item.tags.includes(tag)));

                if (
                    targetRatings.includes(item.star) &&
                    itemDate >= this.startDate &&
                    itemDate < new Date(this.endDate.getTime() + 86400000 * ConfigManager.settings.dateRange) &&
                    imageWidth <= 4800 &&
                    imageHeight <= 4800 &&
                    hasRequiredTags &&
                    hasAddRequiredTags &&
                    !hasNotTags
                ) {
                    if (seed) {
                        if (this.processedSeeds.has(seed)) {
                            return false;
                        } else {
                            return true;
                        }
                    }
                    return true;
                }
                return false;
            });
        },

        // アノテーションからシード値を取得
        getSeedFromAnnotation(annotation) {
            if (!annotation) return null;
            const seedMatch = annotation.match(/Seed: (\d+)/);
            return seedMatch ? seedMatch[1] : null;
        },

        // 日付ごとにアイテムをグループ化
        groupItemsByDate(items) {
            return items.reduce((acc, item) => {
                const date = new Date(item.importedAt);
                const dateString = date.toISOString().split('T')[0];
                if (!acc[dateString]) {
                    acc[dateString] = [];
                }
                acc[dateString].push(item);
                return acc;
            }, {});
        },

        // 日付ごとのアイテムを処理
        async processDateItems(dateString, dateItems, suffix, maxImages) {
            const selectedItems = this.selectItems(dateItems, maxImages);

            const targetFolder = await this.getTargetFolder();
            const { outputFolder, outputPath, tiledImagePath } = this.createOutputPaths(dateString, suffix, selectedItems, targetFolder);

            this.createOutputFolder(outputFolder);

            const { archive, output, closePromise } = this.setupArchive(outputPath);
            const watermark = await this.setupWatermark();

            const { processedImages, metadata, tempFiles } = await this.processSelectedItems(selectedItems, watermark, outputFolder, archive);

            await this.createTiledImage(processedImages, tiledImagePath, metadata);

            await this.finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, suffix);

            Logger.info(`${suffix}: 処理された画像の数: ${selectedItems.length}`);
        },

        // アイテムを選択
        selectItems(dateItems, maxImages) {
            // 重複するseedを持つアイテムを除外
            const uniqueItems = dateItems.filter(item => {
                const seed = this.getSeedFromAnnotation(item.annotation);
                return !(seed && this.processedSeeds.has(seed));
            });

            // アイテムをランダムにシャッフル
            for (let i = uniqueItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [uniqueItems[i], uniqueItems[j]] = [uniqueItems[j], uniqueItems[i]];
            }

            // 指定された最大数のアイテムを選択
            const selectedItems = uniqueItems.slice(0, maxImages);

            return selectedItems;
        },

        // ユニークなファイルパスを生成
        generateUniqueFilePath(baseFolder, dateString, suffix, extension, isTiled = false) {
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
        },

        // 出力パスを作成
        createOutputPaths(dateString, level, selectedItems, targetFolder) {
            const [year, month, day] = dateString.split('-');
            let outputFolder = path.join(ConfigManager.settings.baseOutputFolder, year, month);
            
            // 条件に基づいて "_Uncensored" を追加
            if (selectedItems.some(item => 
                item.folders.includes(targetFolder.id) && 
                item.tags.includes("nsfw"))) {
                outputFolder = path.join(outputFolder, "_Uncensored");
            }
        
            const outputPath = this.generateUniqueFilePath(outputFolder, dateString, level, 'zip');
            const tiledImagePath = this.generateUniqueFilePath(outputFolder, dateString, level, 'jpg', true);
        
            return { 
                outputFolder, 
                outputPath, 
                tiledImagePath, 
                fileNameSuffix: path.basename(outputPath, '.zip').split('_')[1] || '' 
            };
        },

        // 出力フォルダを作成
        createOutputFolder(outputFolder) {
            if (!fs.existsSync(outputFolder)) {
                fs.mkdirSync(outputFolder, { recursive: true });
            }
        },

        // アーカイブを設定
        setupArchive(outputPath) {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            const closePromise = new Promise((resolve, reject) => {
                output.on('close', resolve);
                archive.on('error', reject);
            });

            archive.pipe(output);
            return { archive, output, closePromise };
        },

        // ウォーターマークを設定
        async setupWatermark() {
            const watermark = await Jimp.read(ConfigManager.settings.watermarkPath);
            const config = ConfigManager.settings.watermarkConfig;
            watermark.resize(config.width, config.height);
            watermark.opacity(config.opacity);
            return watermark;
        },

        // 選択されたアイテムを処理
        async processSelectedItems(selectedItems, watermark, outputFolder, archive) {
            const processedImages = [];
            const tempFiles = [];
            const metadata = this.initializeMetadata();

            for (let i = 0; i < selectedItems.length; i++) {
                try {
                    const item = selectedItems[i];
                    const seed = this.getSeedFromAnnotation(item.annotation);
        
                    const { filePath, newFileName, image, tempFilePath, originalWidth, originalHeight } = await this.processSingleItem(item, i, watermark, outputFolder);

                    archive.file(filePath, { name: newFileName });

                    processedImages.push(image);
                    metadata.images.push(this.extractImageMetadata(item, newFileName, originalWidth, originalHeight));

                    tempFiles.push(tempFilePath);

                    if (seed) {
                        this.processedSeeds.add(seed); // 処理したseedを追加
                    }
                } catch (error) {
                    Logger.error(`エラーが発生しました: ${error.message}`);
                }
            }
            return { processedImages, metadata, tempFiles };
        },

        // メタデータを初期化
        initializeMetadata() {
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
        },

        // 単一のアイテムを処理
        async processSingleItem(item, index, watermark, outputFolder) {
            const filePath = item.filePath;
            const seed = this.getSeedFromAnnotation(item.annotation);
            const newFileName = this.generateFileName(index, seed, item.star);
        
            const image = await Jimp.read(filePath);
            const originalWidth = image.getWidth();
            const originalHeight = image.getHeight();
        
            this.addWatermark(image, watermark);
        
            const tempFilePath = path.join(outputFolder, `temp_${Date.now()}_${newFileName}`);
            await image.quality(90).writeAsync(tempFilePath);
        
            const croppedImage = this.cropAndResizeImage(image);
        
            return { filePath: tempFilePath, newFileName, image: croppedImage, originalWidth, originalHeight, tempFilePath };
        },

        // ファイル名を生成
        generateFileName(index, seed, star) {
            if (seed) {
                return `${(index + 1).toString().padStart(3, '0')}_${seed}.jpg`;
            } else {
                return `${(index + 1).toString().padStart(3, '0')}_rate${star}.jpg`;
            }
        },

        // ウォーターマークを追加
        addWatermark(image, watermark) {
            const config = ConfigManager.settings.watermarkConfig;
            const x = image.getWidth() - watermark.getWidth() - config.marginX;
            const y = image.getHeight() - watermark.getHeight() - config.marginY;
            image.composite(watermark, x, y, {
                mode: Jimp.BLEND_SOURCE_OVER,
                opacitySource: config.opacity
            });
        },

        // 画像をクロップしてリサイズ
        cropAndResizeImage(image) {
            const size = Math.min(image.getWidth(), image.getHeight());
            image.crop(
                (image.getWidth() - size) / 2,
                (image.getHeight() - size) / 2,
                size,
                size
            );

            image.resize(ConfigManager.settings.tileSize, ConfigManager.settings.tileSize);
            return image;
        },

        // 画像メタデータを抽出
        extractImageMetadata(item, newFileName, originalWidth, originalHeight) {
            return {
                filename: newFileName,
                width: originalWidth,
                height: originalHeight,
                meta: this.parseMetadata(item.annotation || "")
            };
        },

        // メタデータを解析
        parseMetadata(text) {
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
        },

        // タイル状の画像を作成
        async createTiledImage(processedImages, tiledImagePath, metadata) {
            const tilesPerRow = Math.ceil(Math.sqrt(processedImages.length));
            const tileSize = ConfigManager.settings.tileSize;
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
        },

        // Pythonスクリプトを実行
        async runPythonScript(jsonPath) {
            try {
                const args = ['--file', jsonPath];
                const { stdout, stderr } = await new Promise((resolve, reject) => {
                    execFile(ConfigManager.settings.pythonPath, [ConfigManager.settings.updateTagsPy, ...args], {
                        cwd: path.dirname(ConfigManager.settings.updateTagsPy)
                    }, (error, stdout, stderr) => {
                        if (error) {
                            reject({ error, stdout, stderr });
                        } else {
                            resolve({ stdout, stderr });
                        }
                    });
                });
        
                // if (stdout) Logger.info(`Python出力: ${stdout}`);
                // if (stderr) Logger.error(`Pythonエラー: ${stderr}`);
            } catch (error) {
                Logger.error(`Pythonスクリプト実行エラー: ${error.message}`);
                throw error;
            }
        },

        // アーカイブを完了
        async finalizeArchive(archive, output, closePromise, tiledImagePath, metadata, outputFolder, dateString, tempFiles, suffix) {
            archive.file(tiledImagePath, { name: path.basename(tiledImagePath) });

            await archive.finalize();
            await closePromise;

            const metadataPath = await this.saveMetadata(metadata, outputFolder, dateString, suffix);
            await this.runPythonScript(metadataPath);

            Logger.info(`ZIPファイルが正常に保存されました: ${output.path}`);
            Logger.info(`タイル状の画像が保存されました: ${tiledImagePath}`);

            this.removeTempFiles(tempFiles);
        },

        // メタデータを保存
        saveMetadata(metadata, outputFolder, dateString, suffix) {
            const metadataPath = this.generateUniqueFilePath(outputFolder, dateString, suffix, 'json');
        
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            Logger.info(`メタデータJSONファイルが保存されました: ${metadataPath}`);
            return metadataPath;
        },

        // 一時ファイルを削除
        removeTempFiles(tempFiles) {
            if (Array.isArray(tempFiles)) {
                tempFiles.forEach(tempFilePath => {
                    try {
                        if (fs.existsSync(tempFilePath)) {
                            fs.unlinkSync(tempFilePath);
                            // Logger.info(`一時ファイルを削除しました: ${tempFilePath}`);
                        }
                    } catch (err) {
                        Logger.warning(`一時ファイルの削除に失敗しました: ${tempFilePath} - ${err.message}`);
                    }
                });
            } else {
                Logger.warning("一時ファイルが見つかりませんでした。");
            }
        },

        // 出力フォルダを取得
        async getTargetFolder() {
            const folders = await eagle.folder.getAll();
            const targetFolder = folders.find(folder => folder.name === ConfigManager.settings.output1stFolderName);
            if (!targetFolder) {
                throw new Error(`フォルダ '${ConfigManager.settings.output1stFolderName}' が見つかりません`);
            }
            return targetFolder;
        }
    };

    // UIコントローラー
    const UIController = {
        // 有効な出力条件を取得
        getActiveOutputTerms() {
            const activeTerms = [];
            const checkboxes = document.querySelectorAll('#outputTermsTableBody input[type="checkbox"]');
            
            checkboxes.forEach((checkbox, index) => {
                if (checkbox.checked && ConfigManager.outputImageTerms[index]) {
                    activeTerms.push(ConfigManager.outputImageTerms[index]);
                }
            });

            return activeTerms;
        },

        // 現在のUIの値を取得
        getCurrentTermValues() {
            const rows = document.querySelectorAll('#outputTermsTableBody tr');
            const currentValues = [];
            
            rows.forEach((row, index) => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 5 && ConfigManager.outputImageTerms[index]) {
                    const term = {...ConfigManager.outputImageTerms[index]};
                    // maxImagesを更新
                    term.maxImages = parseInt(inputs[2].value) || term.maxImages;
                    // ratingsを更新
                    term.ratings = inputs[3].value.split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r));
                    // requiredTagsを更新
                    term.requiredTags = inputs[4].value.split(',').map(t => t.trim()).filter(t => t);
                    // notTagsを更新
                    term.notTags = inputs[5].value.split(',').map(t => t.trim()).filter(t => t);
                    
                    currentValues.push(term);
                }
            });
            
            return currentValues;
        },

        // デフォルト値を設定
        setDefaultDates() {
            const today = new Date();
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);

            // YYYY-MM-DD形式に変換
            const formatDate = (date) => {
                return date.toISOString().split('T')[0];
            };

            document.getElementById('endDate').value = formatDate(today);
            document.getElementById('startDate').value = formatDate(oneWeekAgo);
        },

        // outputImageTermsのリストを動的に生成
        populateOutputTermsTable() {
            const tableBody = document.getElementById('outputTermsTableBody');
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            
            // テーブルをクリア
            tableBody.innerHTML = '';

            // config.jsonからoutputImageTermsを取得
            const outputTerms = ConfigManager.config.outputImageTerms;

            // 各項目に対してテーブル行を生成
            outputTerms.forEach((term, index) => {
                const row = document.createElement('tr');
                
                // チェックボックス列
                const checkboxCell = document.createElement('td');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true; // デフォルトで全てチェック
                checkbox.id = `term-checkbox-${index}`;
                checkboxCell.appendChild(checkbox);
                row.appendChild(checkboxCell);

                // Suffix列
                const suffixCell = document.createElement('td');
                const suffixInput = document.createElement('input');
                suffixInput.type = 'text';
                suffixInput.value = term.suffix;
                suffixInput.readOnly = true;
                suffixCell.appendChild(suffixInput);
                row.appendChild(suffixCell);

                // Images列
                const imagesCell = document.createElement('td');
                const imagesInput = document.createElement('input');
                imagesInput.type = 'number';
                imagesInput.value = term.maxImages;
                imagesInput.min = '1';
                imagesCell.appendChild(imagesInput);
                row.appendChild(imagesCell);

                // Ratings列
                const ratingsCell = document.createElement('td');
                const ratingsInput = document.createElement('input');
                ratingsInput.type = 'text';
                ratingsInput.value = term.ratings.join(',');
                ratingsCell.appendChild(ratingsInput);
                row.appendChild(ratingsCell);

                // Tags列
                const tagsCell = document.createElement('td');
                const tagsInput = document.createElement('input');
                tagsInput.type = 'text';
                tagsInput.value = term.requiredTags.join(',');
                tagsCell.appendChild(tagsInput);
                row.appendChild(tagsCell);

                // NotTags列
                const notTagsCell = document.createElement('td');
                const notTagsInput = document.createElement('input');
                notTagsInput.type = 'text';
                notTagsInput.value = term.notTags.join(',');
                notTagsCell.appendChild(notTagsInput);
                row.appendChild(notTagsCell);

                tableBody.appendChild(row);
            });

            // 全選択チェックボックスのイベントリスナー
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        },

        // イベントハンドラを設定
        setupEventHandlers() {
            // 実行ボタンのイベントハンドラ
            document.getElementById('startButton').addEventListener('click', async () => {
                const button = document.getElementById('startButton');
                button.disabled = true; // ボタンを無効化

                try {
                    // UIから現在の値を取得
                    const currentValues = this.getCurrentTermValues();
                    const activeCheckboxes = document.querySelectorAll('#outputTermsTableBody input[type="checkbox"]');
                    
                    // 処理対象の条件リストを作成
                    const termsToProcess = currentValues.filter((_, index) => activeCheckboxes[index] && activeCheckboxes[index].checked);

                    if (termsToProcess.length === 0) {
                        document.getElementById('message').textContent = '少なくとも1つの出力条件を選択してください';
                        button.disabled = false; // ボタンを有効化
                        return;
                    }

                    // 入力値を取得
                    ImageProcessor.startDate = new Date(document.getElementById('startDate').value);
                    ImageProcessor.endDate = new Date(document.getElementById('endDate').value);
                    // タグを配列に変換（カンマで区切って、空白を削除）
                    const tagsInput = document.getElementById('requiredTags').value;
                    const addRequiredTags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
                    // ConfigManager.addRequiredTagsToTerms(addRequiredTags); // 削除

                    // 入力値の検証
                    if (!ImageProcessor.startDate || !ImageProcessor.endDate || isNaN(ImageProcessor.startDate) || isNaN(ImageProcessor.endDate)) {
                        document.getElementById('message').textContent = '日付を入力してください';
                        return;
                    }

                    if (ImageProcessor.startDate > ImageProcessor.endDate) {
                        document.getElementById('message').textContent = '開始日は終了日より前である必要があります';
                        return;
                    }

                    document.getElementById('message').textContent = '処理を開始しました...';
                    Logger.clear(); // ログをクリア
                    Logger.info('処理を開始しました...');
                    
                    await ImageProcessor.processImages(termsToProcess, addRequiredTags); // 引数を渡す
                    
                    document.getElementById('message').textContent = '処理が完了しました！';
                    Logger.info('処理が完了しました！');
                } catch (error) {
                    document.getElementById('message').textContent = 'エラーが発生しました: ' + error.message;
                    Logger.error(`プログラムの実行中にエラーが発生しました: ${error.message}`);
                } finally {
                    button.disabled = false; // 処理完了後にボタンを有効化
                }
            });
            
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

            // ログクリアボタンのイベントリスナー
            document.getElementById('clearLogButton').addEventListener('click', function() {
                document.getElementById('log-content').innerHTML = '';
            });
        }
    };

    // UIの初期化
    console.log("UI初期化開始 - DOMContentLoadedリスナー登録前");
    console.log("現在のdocument.readyState:", document.readyState);
    // Logger.info("DOMContentLoadedイベントリスナーを登録します");
    
    const initializeUI = async () => {
        try {
            // 設定ファイルを読み込み
            const loaded = await ConfigManager.loadConfig();
            if (!loaded) {
                Logger.error("設定ファイルの読み込みに失敗しました");
                return;
            }
            
            UIController.setDefaultDates();
            UIController.setupEventHandlers();
            UIController.populateOutputTermsTable();
        } catch (error) {
            Logger.error(`初期化中にエラーが発生しました: ${error.message}`);
        }
    };

    if (document.readyState === 'loading') {
        console.log("DOMがまだ読み込み中 - イベントリスナーを追加");
        document.addEventListener('DOMContentLoaded', async () => {
            // console.log("DOMContentLoadedイベントが発火しました");
            // Logger.info("DOMContentLoadedイベントが発火しました");
            await initializeUI();
        });
    } else {
        console.log("DOMはすでに読み込み済み - 直接初期化を実行");
        await initializeUI();
    }

    Logger.info("プラグインの初期化が完了しました");
});
