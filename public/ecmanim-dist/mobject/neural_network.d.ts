import { Group } from "./Mobject.ts";
import { Circle, Line } from "./geometry.ts";
import { Animation } from "../animation/Animation.ts";
import type { AnimationConfig } from "../animation/Animation.ts";
import type { ColorLike } from "../core/types.ts";
/** Activation nonlinearity used when propagating a forward pass. */
export type ActivationFunction = "sigmoid" | "tanh";
export interface NeuralNetworkConfig {
    /** Neurons per layer, e.g. [8, 6, 6, 4] (or [784, 16, 16, 10] — big layers
     *  are abbreviated to `maxNeuronsShown` with a vertical ellipsis). */
    layerSizes: number[];
    /** Horizontal distance between layer columns (default 2). */
    layerSpacing?: number;
    /** Vertical distance between neuron centers in a column (default 0.4). */
    neuronSpacing?: number;
    /** Neuron circle radius (default 0.15). */
    neuronRadius?: number;
    /** Layers larger than this render this many neurons split around a
     *  3-dot vertical ellipsis (default 16). */
    maxNeuronsShown?: number;
    /** Base stroke opacity of edges (default 0.35). */
    edgeOpacity?: number;
    /** Edge tint by weight sign (defaults: negative RED, positive BLUE). */
    weightColors?: {
        negative?: ColorLike;
        positive?: ColorLike;
    };
    /** Seed for the deterministic random weights (default 1). */
    seed?: number;
    /** Per-gap weight matrices over SHOWN neurons: weights[gap][from][to].
     *  Missing entries fall back to 0. Wins over `seed`. */
    weights?: number[][][];
    /** Neuron stroke color (default 3b1b BLUE). */
    neuronStrokeColor?: ColorLike;
}
export interface ForwardPassConfig extends AnimationConfig {
    /** Nonlinearity for propagation (default "sigmoid"). */
    activation?: ActivationFunction;
    /** Seconds per stage: each layer-lighting and each pulse wave (default 1). */
    stepTime?: number;
    /** timeWidth handed to each edge's ShowPassingFlash (default 0.3). */
    pulseTimeWidth?: number;
}
/**
 * NeuralNetworkMobject: layered network drawn as columns of circles with
 * straight edges between consecutive layers. Edge strokeWidth scales with
 * |weight|; edge color lerps from grey toward the positive/negative tint by
 * |weight|. Neurons default to WHITE fill at fillOpacity 0 (dark against the
 * 3b1b background) so a neuron's fillOpacity IS its displayed activation.
 */
export declare class NeuralNetworkMobject extends Group {
    layerSizes: number[];
    /** Shown (possibly abbreviated) neuron count per layer. */
    shownSizes: number[];
    /** Per layer, the shown neuron circles (ellipsis dots excluded). */
    neurons: Circle[][];
    /** Per layer, the 3 ellipsis dots when the layer is abbreviated (else []). */
    ellipsisDots: Circle[][];
    /** edges[gap][from][to] over shown neurons. */
    edges: Line[][][];
    /** weights[gap][from][to] over shown neurons. */
    weights: number[][][];
    layerSpacing: number;
    neuronSpacing: number;
    neuronRadius: number;
    maxNeuronsShown: number;
    edgeOpacity: number;
    constructor(config: NeuralNetworkConfig);
    private _columnYs;
    /**
     * Propagate activations through the SHOWN network: a_{l+1}[j] =
     * σ(Σ_i weights[l][i][j] · a_l[i]). Input is truncated/zero-padded to the
     * shown input size. Returns one activation array per layer. Pure.
     */
    computeActivations(activations0: number[], activation?: ActivationFunction): number[][];
    /**
     * Forward-pass animation: lights layer 0 fills by the input activations,
     * then for each gap sends a pulse (ShowPassingFlash) along every edge and
     * lights the next layer by the propagated activations. Deterministic —
     * same weights + input → the same animation every time. Displayed
     * fillOpacity = activation clamped to [0, 1].
     */
    forwardPass(activations0: number[], config?: ForwardPassConfig): Animation;
    /** Small pulse/glow on one output-layer neuron (the argmax beat). */
    highlightOutput(index: number, config?: AnimationConfig): Animation;
}
//# sourceMappingURL=neural_network.d.ts.map