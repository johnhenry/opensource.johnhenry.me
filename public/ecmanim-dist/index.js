// Isomorphic entry point: everything that works in both Node and the browser.
// Backends (video export) live in ./node.js and ./browser.js.
export * as vector from "./core/math/vector.js";
export * as bezier from "./core/math/bezier.js";
export { ORIGIN, UP, DOWN, LEFT, RIGHT, IN, OUT, UL, UR, DL, DR, PI, TAU, DEGREES, } from "./core/math/vector.js";
// Color: the Color class, the full palette (core names top-level + X11/XKCD/
// SVGNAMES/BS381/AS2700/DVIPSNAMES namespaces), and all color utilities.
export * from "./core/color.js";
export * as colors from "./core/color.js";
// Visual effects model (per-mobject blur/glow/shadow/colorAdjust/noise +
// camera-level FrameEffect grading). Fluent API lives on Mobject itself
// (mob.blur(4).glow(8)); these are the descriptors + pure helpers.
export { effectsToCanvasFilter, effectPad, effectsFingerprint, splitEffects, makeNoiseBytes, saturateMatrix, hueRotateMatrix, lerpEffects, } from "./core/effects.js";
// Constants (buffers, axes, screen edges, enums, defaults). PI/TAU/DEGREES come
// from vector.ts above, so exclude them here to avoid a duplicate export.
export { X_AXIS, Y_AXIS, Z_AXIS, TOP, BOTTOM, LEFT_SIDE, RIGHT_SIDE, SMALL_BUFF, MED_SMALL_BUFF, MED_LARGE_BUFF, LARGE_BUFF, DEFAULT_MOBJECT_TO_EDGE_BUFFER, DEFAULT_MOBJECT_TO_MOBJECT_BUFFER, FRAME_HEIGHT, FRAME_WIDTH, FRAME_X_RADIUS, FRAME_Y_RADIUS, DEFAULT_FRAME_RATE, EPSILON, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE, DEFAULT_DOT_RADIUS, DEFAULT_ARROW_TIP_LENGTH, RendererType, LineJointType, CapStyleType, } from "./core/constants.js";
export * as constants from "./core/constants.js";
export { Mobject, Group, CompositeGroup } from "./mobject/Mobject.js";
export { VMobject, VGroup } from "./mobject/VMobject.js";
export { Arc, Circle, Dot, Ellipse, Annulus, Line, DashedLine, Arrow, Polygon, RegularPolygon, Triangle, Rectangle, Square, } from "./mobject/geometry.js";
export * from "./mobject/tips.js";
export * from "./mobject/arcs.js";
export * from "./mobject/polygram.js";
export * from "./mobject/shape_matchers.js";
export * from "./mobject/vectors.js";
export * from "./mobject/labeled.js";
export * from "./mobject/boolean_ops.js";
export * from "./mobject/matrix.js";
export * from "./mobject/table.js";
export * from "./mobject/brace.js";
export * from "./mobject/graph.js";
export { Text, MarkupText, RasterText, CHAR_ASPECT, estimateTextSize, fontSizePt } from "./mobject/text/Text.js";
export * from "./mobject/text/paragraph.js";
export * from "./mobject/text/tex_extras.js";
export * from "./mobject/text/code.js";
export * from "./mobject/text/variable.js";
export { ChangingDecimal, ChangeDecimalToValue } from "./animation/numbers.js";
export { VText, setDefaultFont, setDefaultFontSync, getDefaultFont } from "./mobject/vectorized_text.js";
export { setTextShapingBackend, getTextShapingBackend, isTextShapingBackendActive, buildGlyphRun, measureGlyphRunWidth, } from "./mobject/text_shaping.js";
export { parsePathToSubpaths, subpathsToVMobject } from "./mobject/svg_path.js";
export { MathTex, Tex, SingleStringMathTex, texToVGroup, initMathTex, texToSVG, glyphsFromDomSvg, matchTex, parseTexGroups } from "./mobject/mathtex.js";
export { CubicBezier, QuadBezier, Spline, Path, PolyLine } from "./mobject/curves.js";
export { MathTexImage, mathTexImage } from "./mobject/mathtex_image.js";
export { ImageMobject } from "./mobject/image_mobject.js";
export { VideoMobject } from "./mobject/video_mobject.js";
// Video metadata: schema.org VideoObject + IIIF Presentation manifest export (with
// chapters from nextSection()) + a provenance sliver, and IIIF ingest. See
// docs/metadata.md.
export { toVideoObject, toVideoObjectScript, toIIIFManifest, resolveIIIFVideo, isIIIFManifest, chaptersFrom, metaDuration, toISODuration, MANIM_JS_VERSION, IPTC_ALGORITHMIC_MEDIA, } from "./metadata.js";
export { SVGMobject, parseXML, parseTransform } from "./mobject/svg_mobject.js";
export { ThreeDScene, ThreeDCamera, ThreeDAxes } from "./scene/three_d.js";
export { MovingCameraScene, ScreenRectangle, FullScreenRectangle } from "./scene/moving_camera_scene.js";
export { ZoomedScene, ZoomedDisplay } from "./scene/zoomed_scene.js";
export { VectorScene, LinearTransformationScene } from "./scene/vector_space_scene.js";
export { MultiCamera } from "./camera/multi_camera.js";
export { MappingCamera } from "./camera/mapping_camera.js";
export { Surface, ParametricSurface, Sphere, Torus, Cylinder, Cone, Box, Cube, Prism, Dot3D, Line3D, Arrow3D, ThreeDVMobject, } from "./mobject/surface.js";
export { Polyhedron, Tetrahedron, Octahedron, Icosahedron, Dodecahedron, ConvexHull3D, } from "./mobject/polyhedra.js";
export { loadMeshOBJ, extractMeshData, extractMeshDataFromGeometry, isMeshLoaderAvailable, } from "./loaders/mesh_obj.js";
export { loadMeshSTL } from "./loaders/mesh_stl.js";
export { Mesh3D } from "./mobject/mesh3d.js";
export { loadMesh3D } from "./loaders/mesh3d_loader.js";
export { normalizePixelArray } from "./core/pixel_array.js";
export { loadGeoJSON, GeoMap } from "./loaders/geojson_loader.js";
export { mercator, equirectangular } from "./loaders/geo_projection.js";
export { NumberLine, Axes, NumberPlane, PolarPlane, ComplexPlane, UnitInterval } from "./mobject/coordinate_systems.js";
export { reprojectCurve } from "./mobject/coordinate_reprojection.js";
export * from "./mobject/functions.js";
export * from "./mobject/probability.js";
export { PieChart } from "./mobject/charts.js";
export { GaugeChart } from "./mobject/gauge.js";
export { Legend, ColorBar } from "./mobject/legend.js";
export { Candlestick } from "./mobject/candlestick.js";
export { FunnelChart } from "./mobject/funnel.js";
export { RadarChart } from "./mobject/radar.js";
export { ParticleSystem } from "./mobject/particles.js";
export { CellularAutomaton } from "./mobject/cellular_automaton.js";
export { SoftBodySimulation, SoftBody } from "./mobject/soft_body.js";
export * from "./mobject/vector_field.js";
export * from "./mobject/graphing_scale.js";
export { ValueTracker, DecimalNumber, Integer, alwaysRedraw } from "./mobject/value_tracker.js";
// Opt-in Yoga-backed Flexbox layout (async init -- see docs/flex-group.md).
export { FlexGroup, isYogaLoaded } from "./mobject/flex_group.js";
export { CanvasRenderer, Camera } from "./renderer/CanvasRenderer.js";
export { SVGRenderer, mobjectsToSVG } from "./renderer/SVGRenderer.js";
export { Scene } from "./scene/Scene.js";
export { Direction, slideTransition, fadeTransition, zoomInTransition, finishScene } from "./scene/scene_transitions.js";
export { CameraFrameTween } from "./scene/moving_camera_scene.js";
export { isSceneLike, makeScene, runConstruct, sampleSceneAt } from "./scene/orchestrate.js";
export { Animation, Transform, ReplacementTransform, Create, Write, Uncreate, FadeIn, FadeOut, ApplyMethod, Shift, MoveTo, ScaleAnim, FadeToColor, } from "./animation/Animation.js";
export { AnimationGroup, LaggedStart, LaggedStartMap, Succession, makeAnimateBuilder, } from "./animation/composition.js";
export { GrowFromPoint, GrowFromCenter, GrowFromEdge, SpinInFromNothing, ShrinkToCenter, Rotating, Rotate, MoveAlongPath, Indicate, Flash, Wiggle, Circumscribe, FocusOn, } from "./animation/extra.js";
export { DrawBorderThenFill, Unwrite, ShowIncreasingSubsets, ShowSubmobjectsOneByOne, AddTextLetterByLetter, RemoveTextLetterByLetter, AddTextWordByWord, TypeWithCursor, Untype, UntypeWithCursor, SpiralIn, } from "./animation/creation_extra.js";
export { TransformFromCopy, ClockwiseTransform, CounterclockwiseTransform, MoveToTarget, Restore, ApplyFunction, ApplyPointwiseFunction, ApplyPointwiseFunctionToCenter, ApplyMatrix, ApplyComplexFunction, ScaleInPlace, FadeTransform, FadeTransformPieces, CyclicReplace, Swap, } from "./animation/transform_extra.js";
export { TransformMatchingShapes, TransformMatchingTex, matchingParts } from "./animation/transform_matching.js";
// Automatic shared-element matching (auto-Transform by matchId/text/shape).
export { TransformMatchingAuto, autoMatchKeys } from "./animation/auto_matching.js";
// Diagram-as-code with animated board transitions (parse -> layout -> board).
export { parseDiagram, layoutDiagram, buildBoard, diagram } from "./diagram/diagram.js";
// Learnings from prior-art (py2ts converter, signals reactivity, frame Player).
export { convert as py2ts } from "./tools/py2ts.js";
export * from "./reactive/signal.js";
export { Player, bindScroll, bindPlayerToScroll, computeScrollProgress } from "./player.js";
export { Homotopy, SmoothedVectorizedHomotopy, ComplexHomotopy, PhaseFlow } from "./animation/movement.js";
export { ShowPassingFlash, ShowPassingFlashWithThinningStrokeWidth, ApplyWave, Blink } from "./animation/indication_extra.js";
export { AnimatedBoundary, TracedPath } from "./animation/changing.js";
export { Broadcast, ChangeSpeed, UpdateFromFunc, UpdateFromAlphaFunc } from "./animation/specialized.js";
export { ComplexValueTracker } from "./mobject/complex_value_tracker.js";
export * as rate_functions from "./animation/rate_functions.js";
// After-Effects-style expression/driver helpers (pure, deterministic).
export { wiggle, remap, ramp, valueAtTime, compose, mulberry32 } from "./animation/expressions.js";
// Seeded deterministic noise fields (value/simplex/fbm).
export { valueNoise1D, simplex2D, simplex3D, fbm, fbm3 } from "./core/noise.js";
// --- D3-parity campaign (v0.4.0): scales, shapes, layouts, joins ------------
export { scaleLinear, scaleLog, scalePow, scaleSqrt, scaleRadial, scaleUtc, scaleTime, scaleBand, scalePoint, scaleOrdinal, scaleSequential, scaleDiverging, scaleQuantize, scaleThreshold, visualMapContinuous, } from "./core/scales.js";
export { ascending, descending, extent, max, min, sum, mean, rangeOf, quantile, movingAverage, group, groups, rollup, rollups, groupSort, pairs, ticks, tickStep, tickIncrement, niceExtent, } from "./core/array_utils.js";
export { format, formatSpecifierAuto, utcFormat, utcDay, utcSunday, utcMonday, utcMonth, utcYear } from "./core/format.js";
export { schemeCategory10, schemeTableau10, schemeObservable10, schemeBlues, makeInterpolator, interpolateBlues, interpolateBuPu, interpolatePiYG, interpolateBrBG, interpolateSpectral, interpolateViridis, interpolateTurbo, interpolateRainbow, interpolateTerrain, interpolateHsvLong, interpolateHcl, hsv, } from "./core/color_schemes.js";
export { stack, lineGen, areaGen, pieGen, arcShape, radialPoint, linkHorizontalPoints, linkVerticalPoints, linkRadialPoints, basisBeziers, bundleBeziers, bezierChainMobject, } from "./mobject/shape_gen.js";
export { hierarchy, stratify, treemap, partition, pack, tree, cluster, treemapSquarify, treemapBinary, treemapSlice, treemapDice, treemapSliceDice, packSiblings, packEnclose, HierarchyNode, } from "./layout/hierarchy.js";
export { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, } from "./layout/force.js";
// Deterministic Reynolds flocking (boids) simulation + Mobject wrapper.
export { BoidsSimulation, boidsSimulation } from "./layout/boids.js";
export { BoidsFlock } from "./mobject/boids.js";
export { sankey, sankeyLinkHorizontalPoints } from "./layout/sankey.js";
export { chord, ribbonPoints, chordAngleToPoint } from "./layout/chord.js";
export { contours, contourThresholds } from "./layout/contours.js";
export { hexbin, hexagonPoints } from "./layout/hexbin.js";
export { feature, mesh, decodeArc } from "./loaders/topojson.js";
export { dataJoin, interpolateFrames, rankFrame } from "./animation/data_join.js";
// --- 3b1b campaign (v0.5.0) ---------------------------------------------------
export { sieve, primesUpTo, isPrime, eigen2x2 } from "./core/math/primes.js";
export { hilbertCurve, lsystem } from "./layout/hilbert.js";
export { FourierPath, dftOfPath, samplePath } from "./mobject/fourier_path.js";
export { NeuralNetworkMobject } from "./mobject/neural_network.js";
// --- Mermaid campaign (v0.6.0) -------------------------------------------------
export { loadMermaid, renderMermaidSvg, DiagramMobject } from "./loaders/mermaid_loader.js";
export { revealDiagram, DiagramReveal, parseEdgeEndpoints } from "./animation/diagram_reveal.js";
export { diffDiagrams, DiagramDiff } from "./animation/diagram_diff.js";
export { parseDeckMarkdown, deckFromMarkdown } from "./loaders/deck_markdown.js";
// --- Lottie campaign (v0.7.0) ---------------------------------------------------
export { loadLottie, LottieMobject } from "./mobject/lottie_mobject.js";
export { parseLottie, cubicBezierEase, evalProperty } from "./loaders/lottie_loader.js";
// Scene templates + themes (pure factories; compose with Timeline/transitions).
export { resolveTheme } from "./templates/theme.js";
export { titleCard, lowerThird, statCounter, socialShort, chartReveal, outroCard } from "./templates/templates.js";
// GSAP-style Timeline builder (relative/absolute placement -> one AnimationGroup).
export { Timeline, timeline } from "./animation/timeline.js";
// count/yoyo/repeatDelay wrapper for any leaf Animation/AnimationGroup/Timeline.
export { Repeat } from "./animation/repeat.js";
// Composable stagger value-transform helpers (cycle()/staggerRange()/staggerGrid()).
export { cycle, staggerRange, staggerGrid } from "./animation/stagger.js";
// GSAP Flip plugin parity: capture a "First" bounding/geometry snapshot
// before an instant layout change, then glide from it to the "Last" state.
export { flipGetState, flipFrom } from "./animation/flip.js";
// Motion-Canvas-style tween ergonomics (chainable tweens, spring presets, seeded RNG).
export { tweenTo, tweenSignal, tween, map, TweenChain, springTween, useRandom, PlopSpring, SmoothSpring, BounceSpring, SwingSpring, JumpSpring, StrikeSpring, } from "./animation/tween_chain.js";
// Unified keyframe-track primitive (structured/mutable, unlike opaque RateFuncs).
export { KeyframeTrack, PlayKeyframeTrack, animateSignal } from "./animation/keyframe_track.js";
// Studio-facing property-keyframe track: absolute-time tick(dt)/seek(t) over
// KeyframeTrack, plus bindTrack() wiring a track onto a mobject property.
export { PlayableKeyframeTrack, bindTrack } from "./reactive/keyframes.js";
// Vector (glyph-outline) DecimalNumber — crisp/SVG-friendly live numbers.
export { VectorDecimalNumber, vectorDecimalNumber } from "./mobject/vector_value_tracker.js";
// Composition registry (renderable scenes with metadata) + style/aspect presets.
export { registerComposition, getComposition, listCompositions, compositionsToJSON, unregisterComposition, } from "./scene/compositions.js";
export { STYLE_PRESETS, ASPECT_RATIO_PRESETS, resolveStyle, resolveAspectRatio, registerStylePreset, } from "./core/presets.js";
// Captions: data model + SRT + TikTok-style karaoke pages + an overlay mobject.
export { parseSrt, serializeSrt, createTikTokStyleCaptions, captionAt, } from "./captions/captions.js";
export { CaptionTrack, WordCaptionTrack } from "./captions/caption_track.js";
// Audio analysis for audio-reactive animation (decode + per-frame FFT).
export { getAudioData, visualizeAudio, getWaveformPortion, createSmoothSvgPath } from "./audio/analyze.js";
export { fftInPlace, magnitudeSpectrum, nextPow2 } from "./audio/fft.js";
// Interchange: OTIO timeline model (+ .otio export) and Lottie import/export.
export { rationalTime, rtSeconds, timeRange, toOtioJSON, fromOtioJSON, sceneToOtio, sceneToOtioString, } from "./interchange/otio.js";
export { vmobjectToLottieShapes, lottieShapeToPoints, lottieShapesToVMobject, vmobjectToLottieJSON, loadLottieShapes, } from "./interchange/lottie.js";
// Physics: analytic EM/wave/optics fields + a pluggable rigid-body engine.
export { electricFieldFunc, magneticFieldFunc, ElectricField, MagneticField, thinLensRefract, } from "./physics/fields.js";
export { WaveCurve, LinearWave, StandingWave } from "./physics/waves.js";
export { SimpleEngine, physics, Pendulum } from "./physics/rigid.js";
// Remotion-inspired primitives: range-mapping interpolate, physics springs, and
// composable easing combinators. `interpolate` claims the bare top-level name
// (the 2-arg lerp stays namespaced as `bezier.interpolate`).
export { interpolate } from "./animation/interpolate.js";
export { spring, measureSpring, springRate } from "./animation/spring.js";
export { Easing } from "./animation/easing.js";
// Sequence time-shift + mobject-level transitions (timing orthogonal to presentation).
export { Sequence, SequenceAnimation } from "./animation/sequence.js";
export { crossFade, slide, wipe, Slide, Wipe, linearTiming, springTiming } from "./animation/transitions.js";
// Async-asset gate (Remotion-style delayRender/continueRender).
export { delayRender, continueRender, delayRenderUntil, waitForRender, getPendingRenders, } from "./core/async_gate.js";
// Typed scene params + calculateMetadata hook.
export { defineSchema } from "./core/schema.js";
export { resolveSceneMetadata } from "./scene/scene_params.js";
// Plugin system: register the built-ins, then expose use()/registry.
import { registerBuiltins } from "./plugins/builtins.js";
registerBuiltins();
export { loadWasm, isWasmLoaded, bezierEvalWasm, earclipWasm, mat3VecWasm } from "./wasm.js";
export { loadManifest, loadManifestFromFile } from "./plugins/manifest.js";
export { compileExpr, evalExpr } from "./plugins/expr.js";
export { use, registry, Registry } from "./plugins/registry.js";
// Quality presets mirroring manim's -ql / -qm / -qh flags.
export const QUALITIES = {
    low: { pixelWidth: 854, pixelHeight: 480, fps: 15 },
    medium: { pixelWidth: 1280, pixelHeight: 720, fps: 30 },
    high: { pixelWidth: 1920, pixelHeight: 1080, fps: 60 },
    fourk: { pixelWidth: 3840, pixelHeight: 2160, fps: 60 },
};
//# sourceMappingURL=index.js.map