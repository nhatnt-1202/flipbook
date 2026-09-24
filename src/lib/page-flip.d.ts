// page-flip không kèm type definitions; chỉ khai báo phần app dùng.
declare module "page-flip" {
  export interface FlipSetting {
    width: number;
    height: number;
    size: "fixed" | "stretch";
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    showCover: boolean;
    usePortrait: boolean;
    maxShadowOpacity: number;
    mobileScrollSupport: boolean;
    flippingTime: number;
    startPage: number;
    disableFlipByClick: boolean;
    showPageCorners: boolean;
    swipeDistance: number;
  }

  export class PageFlip {
    constructor(el: HTMLElement, setting: Partial<FlipSetting>);
    loadFromHTML(items: HTMLElement[] | NodeListOf<HTMLElement>): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    getState(): "read" | "flipping" | "user_fold" | "fold_corner";
    flip(page: number): void;
    turnToPage(page: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): "portrait" | "landscape";
    on(event: "flip", cb: (e: { data: number }) => void): this;
    on(event: "changeState", cb: (e: { data: "read" | "flipping" | "user_fold" | "fold_corner" }) => void): this;
    on(event: "init" | "changeOrientation", cb: (e: { data: unknown }) => void): this;
    destroy(): void;
    // Nội bộ thư viện (không có trong tài liệu), dùng cho hiệu ứng lật lui ở chế độ 1 trang
    getRender(): { getRect(): { left: number; top: number; width: number; height: number; pageWidth: number } };
    getFlipController(): FlipController;
  }

  type Point = { x: number; y: number };

  export interface FlipController {
    flip(globalPos: Point): void;
    fold(globalPos: Point): void;
    start(globalPos: Point): boolean;
    setState(state: "read" | "flipping" | "user_fold" | "fold_corner"): void;
    calc: { calc(pagePos: Point): boolean } | null;
    animateFlippingTo(start: Point, dest: Point, isTurned: boolean, needReset?: boolean): void;
  }
}
