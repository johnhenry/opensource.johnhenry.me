// Shared time/frame<->pixel mapping, plus independent render functions per
// data source (renderSectionOverview now; renderWaveform/
// renderKeyframeTimeline land in later phases). These share only the layout
// math, NOT a data model -- a section, a waveform sample, and a keyframe are
// different shapes. Each render function has a DOM-free "compute layout"
// half that's independently unit-testable without a canvas.
export function frameToPixel(frame, opts) {
    if (opts.totalFrames <= 0)
        return 0;
    return (frame / opts.totalFrames) * opts.pixelWidth;
}
export function pixelToFrame(px, opts) {
    if (opts.pixelWidth <= 0)
        return 0;
    return (px / opts.pixelWidth) * opts.totalFrames;
}
export function timeToPixel(t, opts) {
    if (opts.duration <= 0)
        return 0;
    return (t / opts.duration) * opts.pixelWidth;
}
export function pixelToTime(px, opts) {
    if (opts.pixelWidth <= 0)
        return 0;
    return (px / opts.pixelWidth) * opts.duration;
}
/**
 * Pure layout: one thumbnail slot per section, sized proportionally to the
 * section's own share of the timeline, clamped to `minWidth` so short
 * sections stay clickable/visible. An open section (endFrame < 0, i.e. the
 * live/last one before finalizeSections() runs) extends to totalFrames.
 */
export function computeSectionThumbnails(sections, opts) {
    const minWidth = opts.minWidth ?? 24;
    return sections.map((section) => {
        const endFrame = section.endFrame < 0 ? opts.totalFrames : section.endFrame;
        const x = frameToPixel(section.startFrame, opts);
        const rawWidth = Math.max(0, frameToPixel(endFrame, opts) - x);
        return { section, x, width: Math.max(minWidth, rawWidth) };
    });
}
/**
 * Draws one thumbnail per section along a strip, each showing that
 * section's first frame (via Player.drawFrameTo(), already "nearly free"
 * since frames are rasterized bitmaps) at its computed layout position.
 */
export function renderSectionOverview(ctx, player, opts) {
    const layout = computeSectionThumbnails(player.sections(), {
        totalFrames: player.frameCount,
        pixelWidth: opts.pixelWidth,
        minWidth: opts.minWidth,
    });
    for (const { section, x, width } of layout) {
        player.drawFrameTo(ctx, section.startFrame, { x, y: 0, width, height: opts.height });
    }
    return layout;
}
/** Pure layout: one tick mark per playRecord (step), at its start frame. */
export function computeStepMarkers(steps, opts) {
    return steps.map((step) => ({ step, x: frameToPixel(step.startFrame, opts) }));
}
/** Pure layout: one bar per sample, evenly spaced, height proportional to
 *  the sample's peak amplitude (expected in [-1, 1], e.g. from
 *  getWaveformPortion()). */
export function computeWaveformBars(samples, opts) {
    const n = samples.length;
    if (n === 0)
        return [];
    const barWidth = opts.pixelWidth / n;
    return samples.map((amp, i) => ({
        x: i * barWidth,
        height: Math.min(opts.maxHeight, Math.abs(amp) * opts.maxHeight),
    }));
}
/** Draws vertically-centered bars for one sound's waveform onto `ctx`,
 *  positioned at `opts.x`/`opts.y` (e.g. timeToPixel(sound.time, ...) for a
 *  sound scheduled partway through the scene). */
export function renderWaveform(ctx, samples, opts) {
    const bars = computeWaveformBars(samples, { pixelWidth: opts.pixelWidth, maxHeight: opts.height });
    const barWidth = bars.length ? opts.pixelWidth / bars.length : 0;
    const originX = opts.x ?? 0;
    const centerY = (opts.y ?? 0) + opts.height / 2;
    if (ctx) {
        ctx.fillStyle = opts.color ?? "#4fd1c5";
        for (const bar of bars) {
            ctx.fillRect(originX + bar.x, centerY - bar.height / 2, Math.max(1, barWidth - 1), Math.max(1, bar.height));
        }
    }
    return bars;
}
/** Pure layout: one marker per keyframe across all tracks, positioned by time. */
export function computeKeyframeMarkers(tracks, opts) {
    const markers = [];
    for (const track of tracks) {
        track.keyframes.forEach((keyframe, index) => {
            markers.push({ track, keyframe, index, x: timeToPixel(keyframe.t, opts) });
        });
    }
    return markers;
}
/** Draws one row per track, one dot per keyframe. */
export function renderKeyframeTimeline(ctx, tracks, opts) {
    const rowHeight = opts.rowHeight ?? 20;
    const radius = opts.radius ?? 5;
    const markers = computeKeyframeMarkers(tracks, opts);
    if (ctx) {
        ctx.fillStyle = opts.color ?? "#f6ad55";
        for (const m of markers) {
            const rowIndex = tracks.indexOf(m.track);
            const y = rowIndex * rowHeight + rowHeight / 2;
            ctx.beginPath?.();
            ctx.arc?.(m.x, y, radius, 0, Math.PI * 2);
            ctx.fill?.();
        }
    }
    return markers;
}
/**
 * Attaches pointer drag handlers to `canvas` for dragging a keyframe's `t`
 * along the shared time axis (mutating `track.keyframes` directly -- the
 * same "sorted, mutable" contract KeyframeTrack.addKeyframe()/
 * removeKeyframe() already expose for Studio editability).
 */
export function attachKeyframeTimelineEditor(canvas, tracks, opts) {
    const rowHeight = opts.rowHeight ?? 20;
    const hitRadius = opts.hitRadius ?? 8;
    const commitDelayMs = opts.commitDelayMs ?? 150;
    let dragging = null;
    let commitTimer = null;
    const pointerPos = (ev) => {
        const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        return [ev.clientX - rect.left, ev.clientY - rect.top];
    };
    const onPointerDown = (ev) => {
        const [px, py] = pointerPos(ev);
        const markers = computeKeyframeMarkers(tracks, opts);
        let best = null;
        let bestDist = hitRadius;
        for (const m of markers) {
            const rowIndex = tracks.indexOf(m.track);
            const y = rowIndex * rowHeight + rowHeight / 2;
            const dist = Math.hypot(px - m.x, py - y);
            if (dist <= bestDist) {
                best = m;
                bestDist = dist;
            }
        }
        dragging = best;
        // Rows are typically ~20px tall, so a horizontal drag very easily
        // overshoots the canvas's vertical bounds -- capture the pointer so
        // move/up keep targeting this canvas even outside its box (pointerleave
        // fires regardless of capture, which is why it's NOT wired to end the
        // drag below; only a real pointerup does).
        if (dragging)
            canvas.setPointerCapture?.(ev.pointerId);
    };
    const onPointerMove = (ev) => {
        if (!dragging)
            return;
        const [px] = pointerPos(ev);
        dragging.keyframe.t = Math.max(0, pixelToTime(px, opts));
        // Keep keyframes sorted, mirroring KeyframeTrack.addKeyframe()'s own
        // invariant, so valueAt()'s binary-search-by-order assumption still holds.
        dragging.track.keyframes.sort((a, b) => a.t - b.t);
        opts.onChange?.();
    };
    const onPointerUp = (ev) => {
        if (!dragging)
            return;
        canvas.releasePointerCapture?.(ev?.pointerId);
        dragging = null;
        clearTimeout(commitTimer);
        commitTimer = setTimeout(() => opts.onCommit?.(), commitDelayMs);
    };
    canvas.addEventListener?.("pointerdown", onPointerDown);
    canvas.addEventListener?.("pointermove", onPointerMove);
    canvas.addEventListener?.("pointerup", onPointerUp);
    return {
        detach() {
            clearTimeout(commitTimer);
            canvas.removeEventListener?.("pointerdown", onPointerDown);
            canvas.removeEventListener?.("pointermove", onPointerMove);
            canvas.removeEventListener?.("pointerup", onPointerUp);
        },
    };
}
//# sourceMappingURL=timeline.js.map