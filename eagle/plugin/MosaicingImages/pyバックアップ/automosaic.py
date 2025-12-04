from __future__ import annotations

from pathlib import Path
import os
import argparse
import time
from typing import TYPE_CHECKING, Generic, Optional, TypeVar
from dataclasses import dataclass, field

import cv2
from PIL import Image, ImageDraw, PngImagePlugin  # ImageDrawをインポート
from torchvision.transforms.functional import to_pil_image

if TYPE_CHECKING:
    import torch
    from ultralytics import YOLO, YOLOWorld


# 除外するクラス名のリスト（大文字小文字を区別しない）
EXCLUDE_CLASSES = ["nipples", "anus","cross-section"]

def is_excluded_class(class_name: str) -> bool:
    """
    クラス名が除外リストに含まれるかをチェック（完全一致、大文字小文字を区別しない）
    
    Args:
        class_name (str): チェックするクラス名
    
    Returns:
        bool: 除外する場合はTrue、そうでない場合はFalse
    """
    return any(
        excluded.lower() == class_name.lower() 
        for excluded in EXCLUDE_CLASSES
    )

T = TypeVar('T')

@dataclass
class PredictOutput(Generic[T]):
    bboxes: list[list[T]] = field(default_factory=list)
    masks: list[Image.Image] = field(default_factory=list)
    preview: Optional[Image.Image] = None

# 生成メタ情報を持ったままモザイクをかける
# cv2ではなくPillowを使用して処理する
def apply_mosaic_with_meta(image_path: str, output_path: str, bboxes: list[list[float]], mosaic_size: int = 10, no_meta: bool = False):

    pil_image = Image.open(image_path)

    for bbox in bboxes:
        x1, y1, x2, y2 = map(int, bbox)
        w, h = x2 - x1, y2 - y1

        # 矩形領域を切り出す
        roi = pil_image.crop((x1, y1, x2, y2))

        # 矩形領域にモザイクを掛ける
        shrink_w, shrink_h = max(1, w // mosaic_size), max(1, h // mosaic_size)
        roi = roi.resize((shrink_w, shrink_h), Image.Resampling.BICUBIC)
        roi = roi.resize((w, h), Image.Resampling.NEAREST)

        # モザイクを掛けた領域を元の画像に戻す
        pil_image.paste(roi, (x1, y1, x2, y2))

    # 画像を保存
    image_format = pil_image.format.lower() if pil_image.format else 'unknown'
    if (image_format in ["jpeg", "webp"]):
        # JPEG, webp形式ならexif情報をそのままコピーして保存
        exifdata = pil_image.info.get("exif")
        if not no_meta and exifdata:
            pil_image.save(output_path, exif=exifdata)
        else:
            pil_image.save(output_path)
    else:
        #それ以外なら（今のところpngのみを想定）PNGっぽい形式でコピーして保存
        metadata = PngImagePlugin.PngInfo()
        for k, v in pil_image.info.items():
            # 値が文字列でない場合は文字列に変換
            if not isinstance(v, str):
                v = str(v)
            metadata.add_itxt(k, v)
        if no_meta:
            pil_image.save(output_path)
        else:
            pil_image.save(output_path, pnginfo=metadata)

    print(f"モザイクを掛けた画像を保存しました: {output_path}")

def parse_models_with_confidence(models_list: list[str]) -> tuple[list[str], dict]:
    """
    モデル名と信頼度を含むリストをパースし、モデルリストと信頼度マップを返します。
    
    Args:
        models_list (list[str]): モデル名または「モデル名:信頼度」形式の文字列のリスト
    
    Returns:
        tuple: (モデルリスト, 信頼度マップ)
    """
    models = []
    confidence_map = {}
    
    for model_entry in models_list:
        parts = model_entry.split(':')
        if len(parts) == 2:
            model, conf = parts
            models.append(model.strip())
            confidence_map[model.strip()] = max(0.01, min(1.0, float(conf)))
        else:
            models.append(model_entry.strip())
    
    return models, confidence_map

def ultralytics_predict(
    model_path: str | Path,
    image: Image.Image,
    confidence: float = 0.3,
    device: str = "",
    classes: str = "",
    img_size: int = 0,  # 追加: 画像サイズパラメータ
) -> PredictOutput[float]:
    from ultralytics import YOLO

    model = YOLO(model_path)
    apply_classes(model, model_path, classes)
    
    # モデルが認識するクラス名の全リストを出力
    print(f"モデルのクラス名リスト: {model.names}")
    
    # 画像サイズが指定されている場合は、そのサイズを使用
    if img_size > 0:
        print(f"画像サイズを指定: {img_size}")
        pred = model(image, conf=confidence, device=device, imgsz=img_size)
    else:
        # 元の画像サイズを使用（リサイズなし）
        orig_size = max(image.size)
        print(f"元の画像サイズを使用: {orig_size}")
        pred = model(image, conf=confidence, device=device, imgsz=orig_size)

    # クラス名を取得
    detected_classes = [model.names[int(cls)] for cls in pred[0].boxes.cls.cpu().numpy()]
    print(f"検出されたクラス名: {detected_classes}")

    # 除外クラスのデバッグ情報
    excluded_classes = [cls for cls in detected_classes if is_excluded_class(cls)]
    print(f"除外対象のクラス: {excluded_classes}")

    # 除外クラスを除いたバウンディングボックスを取得
    filtered_indices = [
        i for i, cls in enumerate(detected_classes) 
        if not is_excluded_class(cls)
    ]

    # 残されたクラスのデバッグ情報
    remaining_classes = [detected_classes[i] for i in filtered_indices]
    print(f"モザイク処理対象のクラス: {remaining_classes}")

    bboxes = pred[0].boxes.xyxy.cpu().numpy()
    if len(filtered_indices) == 0:
        return PredictOutput()
    
    bboxes = bboxes[filtered_indices].tolist()
    detected_classes = [detected_classes[i] for i in filtered_indices]

    if pred[0].masks is None:
        masks = create_mask_from_bbox(bboxes, image.size)
    else:
        masks = mask_to_pil(pred[0].masks.data[filtered_indices], image.size)
    
    preview = pred[0].plot()
    preview = cv2.cvtColor(preview, cv2.COLOR_BGR2RGB)
    preview = Image.fromarray(preview)

    return PredictOutput(bboxes=bboxes, masks=masks, preview=preview)

def create_mask_from_bbox(
    bboxes: list[list[float]], shape: tuple[int, int]
) -> list[Image.Image]:
    """
    Parameters
    ----------
        bboxes: list[list[float]]
            list of [x1, y1, x2, y2]
            bounding boxes
        shape: tuple[int, int]
            shape of the image (width, height)

    Returns
    -------
        masks: list[Image.Image]
        A list of masks
    """
    masks = []
    for bbox in bboxes:
        mask = Image.new("L", shape, 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rectangle(bbox, fill=255)
        masks.append(mask)
    return masks

def apply_classes(model: YOLO | YOLOWorld, model_path: str | Path, classes: str):
    if not classes or "-world" not in Path(model_path).stem:
        return
    parsed = [c.strip() for c in classes.split(",") if c.strip()]
    if parsed:
        model.set_classes(parsed)

def mask_to_pil(masks: torch.Tensor, shape: tuple[int, int]) -> list[Image.Image]:
    """
    Parameters
    ----------
    masks: torch.Tensor, dtype=torch.float32, shape=(N, H, W).
        The device can be CUDA, but `to_pil_image` takes care of that.

    shape: tuple[int, int]
        (W, H) of the original image
    """
    n = masks.shape[0]
    return [to_pil_image(masks[i], mode="L").resize(shape) for i in range(n)]

# モデル(.pt)ファイルを検証し有効なモデル名の列を返します
def check_models(model_name_list: list[str]) -> list[str]:
    valid_models = []
    if model_name_list == None or len(model_name_list) <= 0:
        print("検出用モデルが指定されていません")
        return valid_models

    model_dir = Path(".\\models")
    for name in model_name_list:
        model = model_dir.joinpath(name.strip())
        if model.is_file():
            valid_models.append(str(model))
        else:
            print(f"[WARN]モデル {model} は見つかりませんでした")

    return valid_models

# 処理対象ファイル列の取得します
def get_target_files(target_files_dir: list[str]) -> list[str]:
    image_extensions = [".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"]
    valid_imgfiles = []

    for file_or_dir in target_files_dir:
        p_file_or_dir = Path(file_or_dir)
        if p_file_or_dir.is_file() and p_file_or_dir.suffix.lower() in image_extensions:
            valid_imgfiles.append(file_or_dir)
        elif p_file_or_dir.is_dir():
            valid_imgfiles += [str(f) for f in list(p_file_or_dir.glob("**/*.*")) if f.suffix.lower() in image_extensions]

    return valid_imgfiles

# ファイル名がすでに存在する場合に連番をつけて返します
def get_org_filename(p_file_path: Path) -> str:
    if p_file_path.exists():
        parent = p_file_path.parent
        for i in range(1,1000):
            new_path = parent.joinpath(f"{p_file_path.stem}{i}{p_file_path.suffix}")
            if not new_path.exists():
                return str(new_path)
    else:
        return str(p_file_path)

    raise ValueError(f"{p_file_path}のユニーク名の生成に失敗しました")

def get_output_filename(output_dir: Path, file_path: str, add_txt: str = "") -> str:
    p_file_path = Path(file_path)
    p_output_file_path = output_dir.joinpath(f"{p_file_path.stem}_{add_txt}{p_file_path.suffix}")
    return get_org_filename(p_output_file_path)

def main(args):
    # 入力の検証
    models, confidence_map = parse_models_with_confidence(args.models)
    models = check_models(models)
    if len(models) <= 0:
        print("[ERROR]検出用モデルが見つかりませんでした")
        return

    targets = get_target_files(args.target_files_dir)
    if len(targets) <= 0:
        print("[ERROR]処理対象の画像ファイルが見つかりませんでした")
        return

    output_dir_name = args.output_dir.strip()
    mosaic_size = max(1, args.mosaic_size)
    device = args.device
    save_preview = args.save_preview
    save_masks = args.save_masks
    no_meta = args.no_meta
    save_same_dir = args.save_same_dir
    img_size = args.img_size  # 追加: 画像サイズパラメータ

    # 出力処理
    if not save_same_dir:
        output_dir = Path(output_dir_name)
        output_dir.mkdir(parents=True, exist_ok=True)

    for image_file in targets:
        print(f"\nファイル {image_file} を処理します")
        if save_same_dir:
            output_dir = Path(image_file).parent

        image = Image.open(image_file).convert("RGB")
        print(f"画像サイズ: {image.width}x{image.height}")

        result_list = [
            ultralytics_predict(
                m, 
                image, 
                confidence=confidence_map.get(Path(m).name, 0.3), 
                device=device, 
                img_size=img_size
            ) 
            for m in models
        ]

        # Combine bboxes
        combined_bboxes = None
        for result in result_list:
            if combined_bboxes == None:
                combined_bboxes = result.bboxes
            else:
                combined_bboxes += result.bboxes
            # プレビュー画像の保存
            if save_preview and result.preview:
                result.preview.save(get_output_filename(output_dir, image_file, "preview"))
            # マスク画像の保存
            if save_masks and result.masks:
                for mask in result.masks:
                    mask.save(get_output_filename(output_dir, image_file, "mask"))

        if combined_bboxes:
            # Apply mosaic to the original image
            output_mosaic_path = get_output_filename(output_dir, image_file, "mosaic")
            apply_mosaic_with_meta(image_file, output_mosaic_path, combined_bboxes, mosaic_size, no_meta=no_meta)


tp = lambda x:list(map(str, x.split(',')))
parser = argparse.ArgumentParser(description="センシティブな部位を自動で検出しモザイクをかけるプログラムです。")
parser.add_argument("target_files_dir", nargs="*", default=[".\\input"], help="処理対象のファイルやフォルダ")
parser.add_argument("-o", "--output_dir", default="output", help="出力先のフォルダ")
# parser.add_argument("-m", "--models", type=tp, default="pussyV2.pt:0.3,penis.pt:0.3", help="検出用モデル（モデル名:信頼度で指定可、デフォルト0.3）")
parser.add_argument("-m", "--models", type=tp, default="ntd11_anime_nsfw_segm_v1_all.pt:0.25,penis.pt:0.75", help="検出用モデル（モデル名:信頼度で指定可、デフォルト0.3）")
parser.add_argument("-n", "--no-meta", action="store_true", help="メタデータをコピーしない")
parser.add_argument("-sp", "--save-preview",default="true", action="store_true", help="プレビュー画像を保存する")
parser.add_argument("-sm", "--save-masks", action="store_true", help="マスク画像を保存する")
parser.add_argument("-ssd", "--save-same-dir", action="store_true", help="入力画像ファイルと同じ場所に出力する")
parser.add_argument("-s", "--mosaic-size", type=int, default=15, help="モザイクのサイズ")
parser.add_argument("-d", "--device", default="", help="処理デバイス(CPUで処理したい場合：--device cpu)")
parser.add_argument("-i", "--img-size", type=int, default=0, help="画像サイズ（0の場合は元のサイズを使用）")  # 追加: 画像サイズパラメータ

if __name__ == "__main__":
    start = time.time()
    main(parser.parse_args())
    end = time.time()
    print(f"\n処理時間:{end - start:.1f}秒")
