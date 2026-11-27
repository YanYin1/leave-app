import type { Employee, LeaveEntry } from '../types.ts';
import {
  formatShortDate,
  formatWeekdayLabel,
  formatWeekRangeLabel,
  getTaiwanNow,
} from './date.ts';

export interface ExportScheduleImageParams {
  storeName: string;
  weekStart: string;
  days: string[];
  employees: Employee[];
  leavesByDate: Map<string, Array<{ entry: LeaveEntry; employee: Employee }>>;
  totalLeavesThisWeek: number;
  dailyMaxLeave: number;
  isWeekLocked: boolean;
  lockStatusText?: string;
}

export interface ExportedScheduleImage {
  blob: Blob;
  dataUrl: string;
  filename: string;
}

const SANS_FONT =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, -apple-system, sans-serif';
const MONO_FONT =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface ChipLayout {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutNameChips(
  ctx: CanvasRenderingContext2D,
  names: string[],
  maxWidth: number,
): { chips: ChipLayout[]; totalHeight: number } {
  if (names.length === 0) {
    return { chips: [], totalHeight: 34 };
  }

  ctx.font = `600 18px ${SANS_FONT}`;
  const chipHeight = 36;
  const chipPadX = 16;
  const gapX = 10;
  const gapY = 10;

  const chips: ChipLayout[] = [];
  let cursorX = 0;
  let cursorY = 0;

  for (const name of names) {
    const textWidth = ctx.measureText(name).width;
    const chipWidth = Math.min(maxWidth, Math.ceil(textWidth + chipPadX * 2));

    if (cursorX > 0 && cursorX + chipWidth > maxWidth) {
      cursorX = 0;
      cursorY += chipHeight + gapY;
    }

    chips.push({
      name,
      x: cursorX,
      y: cursorY,
      w: chipWidth,
      h: chipHeight,
    });

    cursorX += chipWidth + gapX;
  }

  return {
    chips,
    totalHeight: cursorY + chipHeight,
  };
}

export async function generateScheduleImage({
  storeName,
  weekStart,
  days,
  employees,
  leavesByDate,
  totalLeavesThisWeek,
  dailyMaxLeave,
  isWeekLocked,
  lockStatusText,
}: ExportScheduleImageParams): Promise<ExportedScheduleImage> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed even if fonts readiness check fails
    }
  }

  const width = 960;
  const outerPad = 36;
  const cardWidth = width - outerPad * 2;
  const headerHeight = 148;
  const footerHeight = 64;
  const rowPadY = 20;
  const leftColWidth = 248;
  const rightColPadding = 24;
  const rightColMaxWidth = cardWidth - leftColWidth - rightColPadding * 2;

  // Measure canvas first to compute exact dynamic row heights
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('瀏覽器不支援圖片匯出功能');
  }

  const rowLayouts = days.map((date, idx) => {
    const items = leavesByDate.get(date) ?? [];
    const names = items.map(({ employee }) => employee.name);
    const { chips, totalHeight } = layoutNameChips(mCtx, names, rightColMaxWidth);
    const rowHeight = Math.max(82, totalHeight + rowPadY * 2);
    return {
      date,
      idx,
      items,
      names,
      chips,
      contentHeight: totalHeight,
      rowHeight,
    };
  });

  const rowsTotalHeight = rowLayouts.reduce((sum, r) => sum + r.rowHeight, 0);
  const totalCardHeight = headerHeight + rowsTotalHeight + footerHeight;
  const height = outerPad * 2 + totalCardHeight;

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('無法建立圖片畫布');
  }
  ctx.scale(dpr, dpr);

  // Page background (warm light slate)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  // Outer card container
  const cardX = outerPad;
  const cardY = outerPad;
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardWidth, totalCardHeight, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();
  ctx.clip();

  // Top teal accent bar
  ctx.fillStyle = '#0F766E';
  ctx.fillRect(cardX, cardY, cardWidth, 8);

  // Header background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cardX, cardY + 8, cardWidth, headerHeight - 8);

  // Header Title
  const cleanStoreName = storeName.trim() || '門市';
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 30px ${SANS_FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`${cleanStoreName} · 週排休表`, cardX + 32, cardY + 32);

  // Header Lock Status Badge (top-right)
  if (lockStatusText) {
    ctx.font = `600 14px ${SANS_FONT}`;
    const badgeTextWidth = ctx.measureText(lockStatusText).width;
    const badgeW = badgeTextWidth + 24;
    const badgeH = 30;
    const badgeX = cardX + cardWidth - 32 - badgeW;
    const badgeY = cardY + 34;

    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fillStyle = isWeekLocked ? '#FEF3C7' : '#F0FDFA';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = isWeekLocked ? '#FCD34D' : '#99F6E4';
    ctx.stroke();

    ctx.fillStyle = isWeekLocked ? '#92400E' : '#115E59';
    ctx.textBaseline = 'middle';
    ctx.fillText(lockStatusText, badgeX + 12, badgeY + badgeH / 2 + 0.5);
  }

  // Header Subtitle (Date range & summary stats)
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0F766E';
  ctx.font = `700 20px ${MONO_FONT}`;
  const rangeLabel = formatWeekRangeLabel(weekStart);
  ctx.fillText(rangeLabel, cardX + 32, cardY + 80);

  const statsParts = [
    `人數 ${employees.length} 人`,
    `本週排休 ${totalLeavesThisWeek} 人次`,
    ...(dailyMaxLeave > 0 ? [`每日上限 ${dailyMaxLeave} 位`] : []),
  ];
  const statsText = statsParts.join('   ·   ');
  ctx.fillStyle = '#475569';
  ctx.font = `500 15px ${SANS_FONT}`;
  ctx.fillText(statsText, cardX + 32, cardY + 112);

  // Header bottom border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + headerHeight);
  ctx.lineTo(cardX + cardWidth, cardY + headerHeight);
  ctx.stroke();

  // Render 7 day rows
  let currentY = cardY + headerHeight;
  for (let i = 0; i < rowLayouts.length; i++) {
    const row = rowLayouts[i];
    const rowTop = currentY;
    const rowH = row.rowHeight;
    const isWeekend = row.idx >= 5;

    // Alternating subtle background
    ctx.fillStyle = isWeekend ? '#F8FAFC' : i % 2 === 1 ? '#FCFDFE' : '#FFFFFF';
    ctx.fillRect(cardX, rowTop, cardWidth, rowH);

    // Vertical divider between date column and names column
    const dividerX = cardX + leftColWidth;
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, rowTop);
    ctx.lineTo(dividerX, rowTop + rowH);
    ctx.stroke();

    // Left Column: Weekday, Date, On-duty / Leave Count
    const leftCenterY = rowTop + rowH / 2;
    ctx.textBaseline = 'middle';

    // Weekday label
    ctx.fillStyle = isWeekend ? '#0F766E' : '#0F172A';
    ctx.font = `700 19px ${SANS_FONT}`;
    ctx.fillText(formatWeekdayLabel(row.idx), cardX + 32, leftCenterY - 12);

    // Short Date (e.g. 11/23)
    ctx.fillStyle = '#334155';
    ctx.font = `700 20px ${MONO_FONT}`;
    ctx.fillText(formatShortDate(row.date), cardX + 86, leftCenterY - 12);

    // Sub-stat: Off count / On-duty count
    const onDutyCount = Math.max(0, employees.length - row.items.length);
    const isOverCap = dailyMaxLeave > 0 && row.items.length > dailyMaxLeave;
    const isFull = dailyMaxLeave > 0 && row.items.length === dailyMaxLeave;

    ctx.font = `500 13px ${SANS_FONT}`;
    ctx.fillStyle = isOverCap ? '#B91C1C' : isFull ? '#B45309' : '#64748B';
    const quotaSuffix =
      dailyMaxLeave > 0
        ? isOverCap
          ? `（管理員加開）`
          : isFull
            ? `（已滿 ${row.items.length}/${dailyMaxLeave}）`
            : `（${row.items.length}/${dailyMaxLeave}）`
        : '';
    ctx.fillText(
      `休 ${row.items.length} 人 · 班 ${onDutyCount} 人${quotaSuffix}`,
      cardX + 32,
      leftCenterY + 15,
    );

    // Right Column: Leave Employee Name Chips (no IDs, no roles)
    const chipsOriginX = dividerX + rightColPadding;
    const chipsOriginY = rowTop + (rowH - row.contentHeight) / 2;

    if (row.chips.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = `500 16px ${SANS_FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('全員出勤（無人排休）', chipsOriginX, rowTop + rowH / 2);
    } else {
      for (const chip of row.chips) {
        const cx = chipsOriginX + chip.x;
        const cy = chipsOriginY + chip.y;

        drawRoundedRect(ctx, cx, cy, chip.w, chip.h, 10);
        ctx.fillStyle = '#F0FDFA';
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = '#99F6E4';
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = `600 18px ${SANS_FONT}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(chip.name, cx + 16, cy + chip.h / 2 + 0.5);
      }
    }

    // Row bottom divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX, rowTop + rowH);
    ctx.lineTo(cardX + cardWidth, rowTop + rowH);
    ctx.stroke();

    currentY += rowH;
  }

  // Footer
  const footerY = currentY;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(cardX, footerY, cardWidth, footerHeight);

  const now = getTaiwanNow();
  ctx.fillStyle = '#64748B';
  ctx.font = `500 13px ${SANS_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${cleanStoreName} 劃假系統`, cardX + 32, footerY + footerHeight / 2);

  const timestampText = `匯出時間：${now.ymd.replaceAll('-', '/')} ${now.hm}（台灣時間）`;
  const tsWidth = ctx.measureText(timestampText).width;
  ctx.fillText(
    timestampText,
    cardX + cardWidth - 32 - tsWidth,
    footerY + footerHeight / 2,
  );

  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('圖片轉換失敗'));
    }, 'image/png');
  });

  const safeStore = cleanStoreName.replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeStore}_週排休表_${weekStart}.png`;

  return { blob, dataUrl, filename };
}
