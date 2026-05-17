export enum ReaderNodeMode {
  DYNAMIC = "dynamic",
  RGB = "rgb",
  GRAY = "gray",
}

export enum WriterNodeFormat {
  PNG = "png",
  JPEG = "jpeg",
}

export enum NodeType {
  LEVEL = "level",
  FOLDER_READER = "folder_reader",
  FOLDER_WRITER = "folder_writer",
  SHARP = "sharp",
  CVT_COLOR = "cvt_color",
  UPSCALE = "upscale",
  RESIZE = "resize",
  SCREENTONE = "screentone",
  API_SNAPSHOT = "snapshot_writer",
  API_OUTPUT = "api_output",
}

export enum PureNodeType {
  LEVEL = "level",
  FOLDER_READER = "folder_reader",
  FOLDER_WRITER = "folder_writer",
  SHARP = "sharp",
  CVT_COLOR = "cvt_color",
  UPSCALE = "upscale",
  RESIZE = "resize",
  HALFTONE = "halftone",
  API_SNAPSHOT = "snapshot_writer",
  API_OUTPUT = "api_output",
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  [NodeType.LEVEL]: "level",
  [NodeType.FOLDER_READER]: "folder_reader",
  [NodeType.FOLDER_WRITER]: "folder_writer",
  [NodeType.SHARP]: "sharp",
  [NodeType.CVT_COLOR]: "cvt_color",
  [NodeType.UPSCALE]: "upscale",
  [NodeType.RESIZE]: "resize",
  [NodeType.SCREENTONE]: "screentone",
  [NodeType.API_SNAPSHOT]: "API Snapshot",
  [NodeType.API_OUTPUT]: "API Output",
}

export enum CvtType {
  RGB2Gray = "RGB2Gray",
  RGB2Gray709 = "RGB2Gray709",
  RGB2Gray2020 = "RGB2Gray2020",
  Gray2RGB = "Gray2RGB",
}

export enum TilerType {
  EXACT = "exact",
  MAX = "max",
  NO_TILING = "no_tiling",
}

export enum ResizeType {
  BY_WIDTH = "width",
  BY_HEIGHT = "height",
  ABSOLUTE = "absolute",
  PERCENT = "percent",
}

export enum ResizeFilterType {
  NEAREST = "nearest",
  BOX = "box",
  SBOX4 = "sbox4",
  SBOX8 = "sbox8",
  LINEAR = "linear",
  SLINEAR4 = "slinear4",
  SLINEAR8 = "slinear8",
  HAMMING = "hamming",
  SHAMMING4 = "shamming4",
  SHAMMING8 = "shamming8",
  CUBIC_CATROM = "catmullrom",
  SCATMULLROM4 = "scatmullrom4",
  SCATMULLROM8 = "scatmullrom8",
  CUBIC_MITCHELL = "mitchell",
  SMITCHELL4 = "smitchell4",
  SMITCHELL8 = "smitchell8",
  LANCZOS = "lanczos",
  SLANCZOS4 = "slanczos4",
  SLANCZOS8 = "slanczos8",
  GAUSS = "gauss",
  SGAUSS4 = "sgauss4",
  SGAUSS8 = "sgauss8"
}

export enum CannyType {
  NORMAL = "normal",
  INVERT = "invert",
  UNSHARP = "unsharp",
}

export enum DotType {
  CIRCLE = "circle",
  LINE = "line",
  INVERT = "cross",
  ELLIPSE = "ellipse",
  INVLINE = "invline",
}

export enum DType {
  F32 = "F32",
  F16 = "F16",
  BF16 = "BF16",
}

export enum ColorDetectMode {
  AUTO = "auto",
  FORCE_COLOR = "force_color",
  FORCE_GRAY = "force_gray",
}

export enum ModelCacheMode {
  LOW_MEMORY = "low_memory",
  HIGH_MEMORY = "high_memory",
}

export enum HalftoneMode {
  GRAY = "gray",
  RGB = "rgb",
  HSV = "hsv",
  CMYK = "cmyk"
}
