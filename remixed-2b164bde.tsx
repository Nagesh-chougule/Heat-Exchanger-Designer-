import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════
//  ENGINEERING DATA & FLUID PROPERTIES
// ═══════════════════════════════════════════════════════════

const FLUIDS = {
  water: {
    name: "Water (H₂O)", icon: "💧",
    Cp: (T) => 4182 + 0.005 * Math.pow(T - 25, 2),         // J/kg·K
    rho: (T) => 998.2 - 0.434 * (T - 20) - 0.0035 * Math.pow(T - 20, 2), // kg/m³
    mu: (T) => 0.001002 * Math.exp(-0.02 * (T - 20)),       // Pa·s
    k: (T) => 0.5985 + 0.00162 * T - 0.0000063 * T * T,    // W/m·K
    Pr: (T) => {
      const mu = 0.001002 * Math.exp(-0.02 * (T - 20));
      const Cp = 4182 + 0.005 * Math.pow(T - 25, 2);
      const k = 0.5985 + 0.00162 * T - 0.0000063 * T * T;
      return (mu * Cp) / k;
    },
    Tmin: 0, Tmax: 100, color: "#3b9eff", unit: "°C"
  },
  ethyleneGlycol: {
    name: "Ethylene Glycol 50%", icon: "🧪",
    Cp: (T) => 3600 + 2 * T,
    rho: (T) => 1070 - 0.55 * T,
    mu: (T) => 0.0036 * Math.exp(-0.018 * T),
    k: (T) => 0.40 + 0.0003 * T,
    Pr: (T) => (0.0036 * Math.exp(-0.018 * T) * (3600 + 2 * T)) / (0.40 + 0.0003 * T),
    Tmin: -30, Tmax: 120, color: "#34d399", unit: "°C"
  },
  thermalOil: {
    name: "Thermal Oil (Dowtherm)", icon: "🛢",
    Cp: (T) => 1850 + 3.5 * T,
    rho: (T) => 900 - 0.65 * T,
    mu: (T) => 0.024 * Math.exp(-0.025 * T),
    k: (T) => 0.132 - 0.00012 * T,
    Pr: (T) => (0.024 * Math.exp(-0.025 * T) * (1850 + 3.5 * T)) / (0.132 - 0.00012 * T),
    Tmin: 0, Tmax: 300, color: "#f59e0b", unit: "°C"
  },
  steam: {
    name: "Steam (Saturated)", icon: "♨",
    Cp: (T) => 2010 + 4 * T,
    rho: (T) => 0.6 + 0.002 * T,
    mu: (T) => 0.0000125 + 0.00000005 * T,
    k: (T) => 0.026 + 0.00008 * T,
    Pr: (T) => 1.06,
    Tmin: 100, Tmax: 350, color: "#a78bfa", unit: "°C"
  },
  air: {
    name: "Air (Dry)", icon: "🌬",
    Cp: (T) => 1005 + 0.08 * T,
    rho: (T) => 353 / (273 + T),
    mu: (T) => 0.00001716 * Math.pow((T + 273.15) / 273.15, 1.5) * 273.15 / (T + 273.15 + 110.4),
    k: (T) => 0.02425 + 0.000073 * T,
    Pr: (T) => 0.713 - 0.0001 * T,
    Tmin: -50, Tmax: 400, color: "#64748b", unit: "°C"
  },
  refrigerantR134a: {
    name: "Refrigerant R-134a", icon: "❄",
    Cp: (T) => 1460 + 4 * T,
    rho: (T) => 1200 - 6 * T,
    mu: (T) => 0.000200 - 0.0000022 * T,
    k: (T) => 0.092 - 0.0003 * T,
    Pr: (T) => 4.0 - 0.02 * T,
    Tmin: -40, Tmax: 60, color: "#0ea5e9", unit: "°C"
  },
};

const HX_TYPES = {
  shellTube: {
    name: "Shell & Tube", icon: "🔩", code: "ST",
    desc: "Most common industrial type. Suitable for high pressure/temperature.",
    U_range: [800, 2500], F_factor: 0.9,
    params: { passes: [1, 2, 4, 6], baffleTypes: ["25% cut", "35% cut", "50% cut"] }
  },
  plateFin: {
    name: "Plate (Gasketed)", icon: "📐", code: "PH",
    desc: "Compact, high efficiency. Ideal for liquid-liquid heat transfer.",
    U_range: [2500, 6000], F_factor: 1.0,
    params: { platePitch: [2.5, 3.5, 5.0], corrugation: ["45°", "60°", "70°"] }
  },
  doublePipe: {
    name: "Double Pipe", icon: "⚙", code: "DP",
    desc: "Simple design for small duties and high-pressure applications.",
    U_range: [600, 1500], F_factor: 1.0,
    params: { hairpins: [1, 2, 4, 8] }
  },
  spiral: {
    name: "Spiral Heat Exchanger", icon: "🌀", code: "SH",
    desc: "Handles slurries and viscous fluids. Self-cleaning design.",
    U_range: [700, 2000], F_factor: 1.0,
    params: { turns: [3, 5, 8, 12] }
  },
  finTube: {
    name: "Fin & Tube (Air Cooled)", icon: "🌬", code: "FT",
    desc: "Air-cooled condensers and process coolers. No cooling water needed.",
    U_range: [25, 55], F_factor: 0.95,
    params: { finDensity: [3, 4, 6, 8] }
  },
  brazedPlate: {
    name: "Brazed Plate", icon: "🔥", code: "BP",
    desc: "Very compact, high-pressure rated. Used in refrigeration & HVAC.",
    U_range: [3000, 8000], F_factor: 1.0,
    params: { plateThickness: [0.3, 0.4, 0.6] }
  }
};

const MATERIALS = {
  ss316L: {
    name: "Stainless Steel 316L", k: 16.3, cost: 3.8,
    sigma: 170, rhoM: 7990, maxT: 870, minT: -200,
    corr: "Excellent (chloride resistance)", icon: "⬜",
    color: "#94a3b8", code: "316L"
  },
  ss304: {
    name: "Stainless Steel 304", k: 16.2, cost: 2.6,
    sigma: 215, rhoM: 8000, maxT: 870, minT: -196,
    corr: "Very Good", icon: "⬜",
    color: "#cbd5e1", code: "304"
  },
  copper: {
    name: "Copper (C10200)", k: 391, cost: 4.5,
    sigma: 210, rhoM: 8960, maxT: 250, minT: -200,
    corr: "Good (not ammonia)", icon: "🔶",
    color: "#c2794e", code: "C102"
  },
  admiraltyBrass: {
    name: "Admiralty Brass", k: 111, cost: 3.2,
    sigma: 140, rhoM: 8525, maxT: 200, minT: -100,
    corr: "Good (marine)", icon: "🟡",
    color: "#c9a227", code: "AdBr"
  },
  titanium: {
    name: "Titanium Grade 2", k: 16.4, cost: 18.5,
    sigma: 275, rhoM: 4510, maxT: 350, minT: -200,
    corr: "Exceptional (seawater, acids)", icon: "⬛",
    color: "#64748b", code: "Ti-2"
  },
  carbonSteel: {
    name: "Carbon Steel A106", k: 50.2, cost: 0.85,
    sigma: 240, rhoM: 7850, maxT: 425, minT: -28,
    corr: "Fair (needs coating)", icon: "⬜",
    color: "#78716c", code: "A106"
  },
  hastelloyC: {
    name: "Hastelloy C-276", k: 11.1, cost: 45.0,
    sigma: 283, rhoM: 8890, maxT: 1038, minT: -200,
    corr: "Outstanding (all acids)", icon: "🔵",
    color: "#6366f1", code: "C276"
  },
  incoloy825: {
    name: "Incoloy 825", k: 11.1, cost: 28.0,
    sigma: 241, rhoM: 8140, maxT: 540, minT: -200,
    corr: "Excellent (H2S, acids)", icon: "🟣",
    color: "#7c3aed", code: "I825"
  }
};

const FLOW_CONFIGS = {
  counterflow: { name: "Counterflow", F: 1.0, desc: "Maximum thermal efficiency" },
  parallel:    { name: "Parallel Flow", F: 1.0, desc: "Useful for temp-sensitive fluids" },
  crossflow:   { name: "Crossflow",    F: 0.92, desc: "Common in gas-liquid HX" },
  multipass:   { name: "Multi-pass",  F: 0.87, desc: "Shell & tube multi-pass" },
};

// ═══════════════════════════════════════════════════════════
//  THERMAL CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════

function calcFluidProps(fluidKey, T) {
  const f = FLUIDS[fluidKey];
  if (!f) return null;
  const Tmean = T;
  return {
    Cp: f.Cp(Tmean),
    rho: f.rho(Tmean),
    mu: f.mu(Tmean),
    k: f.k(Tmean),
    Pr: f.Pr(Tmean),
  };
}

function calcNusselt(Re, Pr, D_h, L) {
  if (Re < 2300) {
    // Laminar — Sieder-Tate or constant Nusselt
    return Math.max(3.66, 1.86 * Math.pow((Re * Pr * D_h) / L, 1/3));
  } else if (Re < 10000) {
    // Transition
    const f = Math.pow(0.790 * Math.log(Re) - 1.64, -2);
    return (f / 8) * (Re - 1000) * Pr / (1 + 12.7 * Math.sqrt(f / 8) * (Math.pow(Pr, 2/3) - 1));
  } else {
    // Turbulent — Dittus-Boelter
    return 0.023 * Math.pow(Re, 0.8) * Math.pow(Pr, 0.4);
  }
}

function performThermalCalc(inputs) {
  const {
    hx_type, flow_config,
    fluid_h, fluid_c,
    T_h_in, T_h_out,
    T_c_in, T_c_out,
    mdot_h, mdot_c,
    material, fouling_h, fouling_c,
    // Geometry hints
    tube_od_mm, tube_id_mm, tube_length_m, n_tube_passes, n_shell_passes,
    plate_gap_mm, plate_width_mm, plate_length_mm,
  } = inputs;

  const hxDef   = HX_TYPES[hx_type];
  const flowDef = FLOW_CONFIGS[flow_config];
  const mat     = MATERIALS[material];

  // Mean temperatures
  const T_h_mean = (T_h_in + T_h_out) / 2;
  const T_c_mean = (T_c_in  + T_c_out) / 2;

  // Fluid properties at mean temperatures
  const propsH = calcFluidProps(fluid_h, T_h_mean);
  const propsC = calcFluidProps(fluid_c, T_c_mean);

  if (!propsH || !propsC) return null;

  // Heat capacity rates
  const C_h = mdot_h * propsH.Cp;   // W/K
  const C_c = mdot_c * propsC.Cp;   // W/K

  // Heat duty from hot side, verify cold side
  const Q_h = mdot_h * propsH.Cp * (T_h_in - T_h_out);   // W
  const Q_c = mdot_c * propsC.Cp * (T_c_out - T_c_in);   // W

  // Energy balance check
  const Q_avg  = (Q_h + Q_c) / 2;
  const imbalance = Math.abs((Q_h - Q_c) / Q_avg) * 100;

  // LMTD Calculation
  let dT1, dT2;
  if (flow_config === "counterflow") {
    dT1 = T_h_in  - T_c_out;
    dT2 = T_h_out - T_c_in;
  } else {
    dT1 = T_h_in  - T_c_in;
    dT2 = T_h_out - T_c_out;
  }

  const LMTD = Math.abs(dT1 - dT2) < 0.001
    ? dT1
    : (dT1 - dT2) / Math.log(Math.abs(dT1 / dT2));

  const F = flowDef.F;
  const LMTD_eff = LMTD * F;

  // NTU-Effectiveness
  const C_min = Math.min(C_h, C_c);
  const C_max = Math.max(C_h, C_c);
  const C_r   = C_min / C_max;
  const Q_max = C_min * (T_h_in - T_c_in);
  const epsilon = Q_avg / Q_max;

  let NTU;
  if (hx_type === "shellTube" || hx_type === "multipass") {
    if (Math.abs(C_r - 1) < 0.001) {
      NTU = epsilon / (1 - epsilon);
    } else {
      NTU = Math.log((1 - C_r * epsilon) / (1 - epsilon)) / (1 - C_r);
    }
  } else {
    // Counterflow default
    if (Math.abs(C_r - 1) < 0.001) NTU = epsilon / (1 - epsilon);
    else NTU = Math.log((1 - C_r * epsilon) / (1 - epsilon)) / (1 - C_r);
  }

  // Overall HTC — use mid-range of U_range as design U
  const U_mid = (hxDef.U_range[0] + hxDef.U_range[1]) / 2;

  // Geometry-specific calculations
  let geometry = {};

  if (hx_type === "shellTube") {
    const d_o = (tube_od_mm || 25.4) / 1000;   // m
    const d_i = (tube_id_mm || 21.2) / 1000;   // m
    const L   = tube_length_m || 4.0;
    const pitch_ratio = 1.25;
    const pitch = d_o * pitch_ratio;

    // Tube-side (cold): Reynolds number per tube
    const A_tube_one = Math.PI * d_i * d_i / 4;
    const n_tubes_trial = 20; // initial guess
    const mdot_per_tube = mdot_c / n_tubes_trial;
    const v_tube = mdot_per_tube / (propsC.rho * A_tube_one);
    const Re_tube = propsC.rho * v_tube * d_i / propsC.mu;
    const Nu_tube = calcNusselt(Re_tube, propsC.Pr, d_i, L);
    const h_i = Nu_tube * propsC.k / d_i;

    // Shell-side (hot): simplified Bell-Delaware
    const D_shell_trial = Math.sqrt(n_tubes_trial * d_o * d_o * pitch_ratio * pitch_ratio * 4 / Math.PI) * 1.2;
    const A_shell_flow = D_shell_trial * 0.2 * pitch;
    const v_shell = mdot_h / (propsH.rho * A_shell_flow);
    const D_eq_shell = d_o * (4 * Math.pow(pitch_ratio, 2) / Math.PI - 1);
    const Re_shell = propsH.rho * v_shell * D_eq_shell / propsH.mu;
    const Nu_shell = 0.36 * Math.pow(Re_shell, 0.55) * Math.pow(propsH.Pr, 1/3);
    const h_o = Nu_shell * propsH.k / D_eq_shell;

    // Wall resistance
    const R_wall = Math.log(d_o / d_i) / (2 * Math.PI * mat.k * L);
    const U_calc = 1 / (1/h_i + d_i*fouling_c + R_wall*d_i*(Math.PI) + (d_i/d_o)*(d_o*fouling_h) + (d_i/d_o)/h_o);

    const U_design = Math.max(hxDef.U_range[0], Math.min(U_calc || U_mid, hxDef.U_range[1]));
    const A_required = Q_avg / (U_design * LMTD_eff);
    const n_tubes = Math.ceil(A_required / (Math.PI * d_o * L));
    const n_shells = n_shell_passes || 1;

    // Shell diameter (triangular pitch)
    const A_tube_sheet = n_tubes * pitch * pitch * Math.sqrt(3) / 2 / 0.785;
    const D_shell = Math.sqrt(4 * A_tube_sheet / Math.PI) * 1.1;
    const n_baffles = Math.ceil(L / (0.5 * D_shell));
    const baffle_spacing = L / (n_baffles + 1);

    geometry = {
      type: "shell_tube",
      A_required: A_required.toFixed(2),
      U_design: U_design.toFixed(0),
      h_i: h_i.toFixed(0), h_o: h_o.toFixed(0),
      Re_tube: Re_tube.toFixed(0), Re_shell: Re_shell.toFixed(0),
      d_o_mm: (d_o * 1000).toFixed(1), d_i_mm: (d_i * 1000).toFixed(1),
      L_m: L.toFixed(2), n_tubes,
      D_shell_mm: (D_shell * 1000).toFixed(0),
      n_baffles, baffle_spacing_mm: (baffle_spacing * 1000).toFixed(0),
      n_tube_passes: n_tube_passes || 2,
      pitch_mm: (pitch * 1000).toFixed(1),
      wall_thickness_mm: ((d_o - d_i) / 2 * 1000).toFixed(1),
      v_tube: v_tube.toFixed(2), v_shell: v_shell.toFixed(2),
    };
  }
  else if (hx_type === "plateFin" || hx_type === "brazedPlate") {
    const gap  = (plate_gap_mm || 3.0) / 1000;
    const W    = (plate_width_mm || 250) / 1000;
    const Lp   = (plate_length_mm || 500) / 1000;
    const D_h  = 2 * gap;

    const A_ch = gap * W;
    const Re_h = propsH.rho * (mdot_h / (propsH.rho * A_ch)) * D_h / propsH.mu;
    const Re_c = propsC.rho * (mdot_c / (propsC.rho * A_ch)) * D_h / propsC.mu;
    const Nu_h = calcNusselt(Re_h, propsH.Pr, D_h, Lp);
    const Nu_c = calcNusselt(Re_c, propsC.Pr, D_h, Lp);
    const h_h  = Nu_h * propsH.k / D_h;
    const h_c  = Nu_c * propsC.k / D_h;

    const t_plate = 0.0006; // 0.6 mm
    const U_design = 1 / (1/h_h + fouling_h + t_plate/mat.k + fouling_c + 1/h_c);
    const A_required = Q_avg / (U_design * LMTD_eff);
    const A_per_plate = W * Lp;
    const n_plates = Math.ceil(A_required / A_per_plate) + 2;
    const n_channels = n_plates - 1;
    const packLength = n_plates * (gap + t_plate);

    geometry = {
      type: "plate",
      A_required: A_required.toFixed(2),
      U_design: U_design.toFixed(0),
      h_h: h_h.toFixed(0), h_c: h_c.toFixed(0),
      Re_h: Re_h.toFixed(0), Re_c: Re_c.toFixed(0),
      gap_mm: (gap * 1000).toFixed(1),
      W_mm: (W * 1000).toFixed(0),
      Lp_mm: (Lp * 1000).toFixed(0),
      n_plates, n_channels,
      packLength_mm: (packLength * 1000).toFixed(0),
      A_per_plate: A_per_plate.toFixed(4),
      t_plate_mm: (t_plate * 1000).toFixed(1),
    };
  }
  else if (hx_type === "doublePipe") {
    const d_i = 0.0254;  // 1" inner pipe
    const d_o_inner = 0.0334;
    const D_i_ann  = 0.0508;  // 2" outer pipe

    const A_inner = Math.PI * d_i * d_i / 4;
    const A_ann   = Math.PI * (D_i_ann * D_i_ann - d_o_inner * d_o_inner) / 4;
    const v_inner = mdot_c / (propsC.rho * A_inner);
    const v_ann   = mdot_h / (propsH.rho * A_ann);
    const D_h_ann = D_i_ann - d_o_inner;

    const Re_i = propsC.rho * v_inner * d_i / propsC.mu;
    const Re_a = propsH.rho * v_ann   * D_h_ann / propsH.mu;
    const Nu_i = calcNusselt(Re_i, propsC.Pr, d_i, 3.0);
    const Nu_a = calcNusselt(Re_a, propsH.Pr, D_h_ann, 3.0);
    const h_i  = Nu_i * propsC.k / d_i;
    const h_a  = Nu_a * propsH.k / D_h_ann;

    const U_design = 1 / (1/h_i + fouling_c + Math.log(d_o_inner/d_i)/(2*Math.PI*mat.k*1) + fouling_h + 1/h_a);
    const A_required = Q_avg / (U_design * LMTD_eff);
    const L_per_pass = 3.0; // typical hairpin length
    const n_hairpins = Math.ceil(A_required / (Math.PI * d_i * L_per_pass));
    const total_length = n_hairpins * L_per_pass * 2;

    geometry = {
      type: "double_pipe",
      A_required: A_required.toFixed(2),
      U_design: U_design.toFixed(0),
      h_i: h_i.toFixed(0), h_a: h_a.toFixed(0),
      Re_i: Re_i.toFixed(0), Re_a: Re_a.toFixed(0),
      d_i_mm: (d_i * 1000).toFixed(1),
      D_ann_mm: (D_i_ann * 1000).toFixed(1),
      n_hairpins, L_per_pass,
      total_length_m: total_length.toFixed(1),
      v_inner: v_inner.toFixed(2), v_ann: v_ann.toFixed(2),
    };
  }
  else {
    // Generic for spiral, fin-tube
    const U_design = U_mid;
    const A_required = Q_avg / (U_design * LMTD_eff);
    geometry = {
      type: "generic",
      A_required: A_required.toFixed(2),
      U_design: U_design.toFixed(0),
    };
  }

  // Pressure drop estimation
  const dP_h = 0.5 * propsH.rho * Math.pow(mdot_h / (propsH.rho * 0.01), 2) * 0.02;  // simplified
  const dP_c = 0.5 * propsC.rho * Math.pow(mdot_c / (propsC.rho * 0.01), 2) * 0.02;

  // Pumping power
  const P_pump_h = mdot_h * dP_h / propsH.rho;
  const P_pump_c = mdot_c * dP_c / propsC.rho;

  // Material mass estimate
  let mass_kg = 0;
  if (hx_type === "shellTube" && geometry.n_tubes) {
    const V_tubes = geometry.n_tubes * Math.PI * (Math.pow(parseFloat(geometry.d_o_mm)/1000, 2) - Math.pow(parseFloat(geometry.d_i_mm)/1000, 2)) / 4 * parseFloat(geometry.L_m);
    mass_kg = V_tubes * mat.rhoM;
  }

  return {
    // Thermal
    Q: Q_avg, Q_h, Q_c, imbalance,
    LMTD, LMTD_eff, F,
    C_h, C_c, C_min, C_max, C_r,
    epsilon, NTU, Q_max,
    // Geometry
    geometry,
    // Fluids
    propsH: { ...propsH, T: T_h_mean },
    propsC: { ...propsC, T: T_c_mean },
    // Performance
    dP_h: dP_h.toFixed(0), dP_c: dP_c.toFixed(0),
    P_pump: (P_pump_h + P_pump_c).toFixed(1),
    mass_kg: mass_kg.toFixed(1),
    // Material
    mat,
  };
}

// ═══════════════════════════════════════════════════════════
//  FUSION 360 SCRIPT GENERATOR
// ═══════════════════════════════════════════════════════════

function generateFusionScript(inputs, results) {
  const g = results.geometry;
  const hxType = inputs.hx_type;

  const jsonParams = {
    metadata: {
      software: "Heat Exchanger Design Suite v1.0",
      generated: new Date().toISOString(),
      hx_type: HX_TYPES[hxType].name,
      material: MATERIALS[inputs.material].name,
      duty_kW: (results.Q / 1000).toFixed(2),
    },
    design_inputs: {
      hot_fluid: FLUIDS[inputs.fluid_h].name,
      cold_fluid: FLUIDS[inputs.fluid_c].name,
      T_h_in: inputs.T_h_in, T_h_out: inputs.T_h_out,
      T_c_in: inputs.T_c_in, T_c_out: inputs.T_c_out,
      mdot_h: inputs.mdot_h, mdot_c: inputs.mdot_c,
      LMTD: results.LMTD.toFixed(2),
      U: g.U_design, A_req: g.A_required,
      effectiveness: (results.epsilon * 100).toFixed(1) + "%",
      NTU: results.NTU.toFixed(3),
    },
    geometry: g,
  };

  let fusionCode = "";

  if (hxType === "shellTube") {
    const n = g;
    fusionCode = `# ============================================================
# Fusion 360 Python API Script — Shell & Tube Heat Exchanger
# Generated by Heat Exchanger Design Suite
# Duty: ${(results.Q / 1000).toFixed(1)} kW | Material: ${MATERIALS[inputs.material].name}
# ============================================================

import adsk.core, adsk.fusion, adsk.cam, traceback, math

def run(context):
    ui = None
    try:
        app  = adsk.core.Application.get()
        ui   = app.userInterface
        des  = adsk.fusion.Design.cast(app.activeProduct)
        root = des.rootComponent

        # ── Design Parameters ────────────────────────────────
        TUBE_OD_MM    = ${n.d_o_mm}      # Tube outer diameter (mm)
        TUBE_ID_MM    = ${n.d_i_mm}      # Tube inner diameter (mm)
        TUBE_LENGTH_M = ${n.L_m}         # Tube length (m)
        N_TUBES       = ${n.n_tubes}     # Number of tubes
        SHELL_ID_MM   = ${n.D_shell_mm}  # Shell inner diameter (mm)
        N_BAFFLES     = ${n.n_baffles}   # Number of baffles
        BAFFLE_SPACING= ${n.baffle_spacing_mm} # Baffle spacing (mm)
        N_PASSES      = ${n.n_tube_passes}     # Number of tube passes
        PITCH_MM      = ${n.pitch_mm}    # Tube pitch (mm)
        WALL_T_MM     = ${n.wall_thickness_mm} # Wall thickness (mm)

        # ── Unit Conversions (Fusion uses cm) ────────────────
        scale  = 0.1  # mm → cm
        tube_od = TUBE_OD_MM * scale
        tube_id = TUBE_ID_MM * scale
        L_cm    = TUBE_LENGTH_M * 100
        shell_r = (SHELL_ID_MM / 2) * scale
        shell_t = 10 * scale   # 10 mm shell wall
        pitch   = PITCH_MM * scale

        sketches    = root.sketches
        extrudes    = root.features.extrudeFeatures
        components  = root.occurrences

        # ── Create Shell Cylinder ────────────────────────────
        xyPlane   = root.xYConstructionPlane
        shellSketch = sketches.add(xyPlane)
        shellSketch.sketchCurves.sketchCircles.addByCenterRadius(
            adsk.core.Point3D.create(0, 0, 0),
            shell_r + shell_t
        )
        shellSketch.sketchCurves.sketchCircles.addByCenterRadius(
            adsk.core.Point3D.create(0, 0, 0),
            shell_r
        )

        prof = shellSketch.profiles.item(0)
        ext  = adsk.fusion.ExtrudeFeatureInput
        inp  = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        dist = adsk.core.ValueInput.createByReal(L_cm)
        inp.setDistanceExtent(False, dist)
        shell_body = extrudes.add(inp)

        # ── Create Tube Bundle ───────────────────────────────
        # Triangular pitch layout
        rows = int(math.floor(math.sqrt(N_TUBES)))
        count = 0
        tube_bodies = []

        for row in range(-rows, rows + 1):
            if count >= N_TUBES:
                break
            x_offset = 0 if row % 2 == 0 else pitch / 2
            y_pos = row * pitch * math.sqrt(3) / 2

            for col in range(-rows, rows + 1):
                if count >= N_TUBES:
                    break
                x_pos = col * pitch + x_offset
                r_dist = math.sqrt(x_pos**2 + y_pos**2)

                if r_dist < (shell_r - tube_od):
                    tubeSketch = sketches.add(xyPlane)
                    ctr = adsk.core.Point3D.create(x_pos, y_pos, 0)
                    tubeSketch.sketchCurves.sketchCircles.addByCenterRadius(ctr, tube_od/2)
                    tubeSketch.sketchCurves.sketchCircles.addByCenterRadius(ctr, tube_id/2)

                    prof = tubeSketch.profiles.item(0)
                    inp2 = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
                    inp2.setDistanceExtent(False, adsk.core.ValueInput.createByReal(L_cm))
                    tube_body = extrudes.add(inp2)
                    tube_bodies.append(tube_body)
                    count += 1

        # ── Create Baffles ───────────────────────────────────
        baffle_t = 5 * scale  # 5 mm thick baffle
        offset_planes = root.constructionPlanes
        spacing_cm = (L_cm - 2 * baffle_t) / (N_BAFFLES + 1)

        for i in range(1, N_BAFFLES + 1):
            z_pos = i * spacing_cm
            planeInput = offset_planes.createInput()
            planeInput.setByOffset(
                root.xYConstructionPlane,
                adsk.core.ValueInput.createByReal(z_pos)
            )
            baffPlane = offset_planes.add(planeInput)

            baffSketch = sketches.add(baffPlane)
            baffSketch.sketchCurves.sketchCircles.addByCenterRadius(
                adsk.core.Point3D.create(0, 0, 0), shell_r
            )
            # Cut 25% baffle window
            # (simplified — full disk here, production: add trim)
            prof = baffSketch.profiles.item(0)
            inp3 = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
            inp3.setDistanceExtent(False, adsk.core.ValueInput.createByReal(baffle_t))
            extrudes.add(inp3)

        # ── Apply Material ───────────────────────────────────
        # Requires Fusion material library access
        # mat = des.materials.itemByName('${MATERIALS[inputs.material].name}')

        # ── Add Parameters as User Parameters ────────────────
        params = des.userParameters
        param_defs = [
            ("HX_TubeOD_mm",   TUBE_OD_MM,    "mm",  "Tube outer diameter"),
            ("HX_TubeID_mm",   TUBE_ID_MM,    "mm",  "Tube inner diameter"),
            ("HX_TubeLength_m",TUBE_LENGTH_M, "m",   "Tube length"),
            ("HX_NumTubes",    N_TUBES,       "",    "Number of tubes"),
            ("HX_ShellID_mm",  SHELL_ID_MM,   "mm",  "Shell inner diameter"),
            ("HX_NumBaffles",  N_BAFFLES,     "",    "Number of baffles"),
            ("HX_Duty_kW",     ${(results.Q / 1000).toFixed(2)}, "", "Heat duty (kW)"),
            ("HX_LMTD_K",      ${results.LMTD.toFixed(2)},       "",  "LMTD (K)"),
            ("HX_U_W_m2K",     ${g.U_design}, "", "Overall HTC (W/m²K)"),
            ("HX_Area_m2",     ${g.A_required},"", "Heat transfer area (m²)"),
            ("HX_Effectiveness",${(results.epsilon * 100).toFixed(1)}, "", "Effectiveness %"),
        ]

        for name, val, unit, comment in param_defs:
            expr = str(val) if not unit else f"{val} {unit}"
            existing = params.itemByName(name)
            if existing:
                existing.expression = expr
                existing.comment = comment
            else:
                valInput = adsk.core.ValueInput.createByString(expr)
                params.add(name, valInput, unit, comment)

        ui.messageBox(
            f"✅ Heat Exchanger Created Successfully!\\n\\n"
            f"Duty:           ${(results.Q / 1000).toFixed(2)} kW\\n"
            f"LMTD:           ${results.LMTD.toFixed(2)} K\\n"
            f"U-overall:      ${g.U_design} W/m²K\\n"
            f"Heat Area:      ${g.A_required} m²\\n"
            f"Effectiveness:  ${(results.epsilon * 100).toFixed(1)}%\\n"
            f"Tubes:          ${g.n_tubes} × ⌀${g.d_o_mm}mm OD × ${g.L_m}m\\n"
            f"Shell ID:       ${g.D_shell_mm} mm\\n"
            f"Baffles:        ${g.n_baffles} @ ${g.baffle_spacing_mm}mm spacing",
            "Heat Exchanger Design Suite"
        )

    except:
        if ui:
            ui.messageBox("Error:\\n" + traceback.format_exc())
`;
  } else if (hxType === "plateFin" || hxType === "brazedPlate") {
    const n = g;
    fusionCode = `# ============================================================
# Fusion 360 Python API Script — Plate Heat Exchanger
# Generated by Heat Exchanger Design Suite
# Duty: ${(results.Q / 1000).toFixed(1)} kW | Material: ${MATERIALS[inputs.material].name}
# ============================================================

import adsk.core, adsk.fusion, adsk.cam, traceback

def run(context):
    ui = None
    try:
        app  = adsk.core.Application.get()
        ui   = app.userInterface
        des  = adsk.fusion.Design.cast(app.activeProduct)
        root = des.rootComponent

        # ── Design Parameters ────────────────────────────────
        N_PLATES      = ${n.n_plates}      # Number of plates
        PLATE_W_MM    = ${n.W_mm}          # Plate width (mm)
        PLATE_L_MM    = ${n.Lp_mm}         # Plate length (mm)
        GAP_MM        = ${n.gap_mm}        # Channel gap (mm)
        T_PLATE_MM    = ${n.t_plate_mm}    # Plate thickness (mm)
        PACK_L_MM     = ${n.packLength_mm} # Total pack length (mm)
        AREA_REQ_M2   = ${n.A_required}    # Required area (m²)
        AREA_PER_PLT  = ${n.A_per_plate}   # Area per plate (m²)

        scale   = 0.1  # mm → cm
        W_cm    = PLATE_W_MM * scale
        L_cm    = PLATE_L_MM * scale
        gap_cm  = GAP_MM * scale
        t_cm    = T_PLATE_MM * scale
        pack_cm = PACK_L_MM * scale

        sketches  = root.sketches
        extrudes  = root.features.extrudeFeatures
        xyPlane   = root.xYConstructionPlane
        constPlanes = root.constructionPlanes
        
        # ── Stack plates iteratively ─────────────────────────
        z_current = 0.0

        for i in range(N_PLATES):
            # Create offset plane for this plate
            if i == 0:
                plane = xyPlane
            else:
                inp = constPlanes.createInput()
                inp.setByOffset(xyPlane, adsk.core.ValueInput.createByReal(z_current))
                plane = constPlanes.add(inp)

            # Plate sketch
            sk = sketches.add(plane)
            lines = sk.sketchCurves.sketchLines
            p0 = adsk.core.Point3D.create(-W_cm/2, -L_cm/2, 0)
            p1 = adsk.core.Point3D.create( W_cm/2, -L_cm/2, 0)
            p2 = adsk.core.Point3D.create( W_cm/2,  L_cm/2, 0)
            p3 = adsk.core.Point3D.create(-W_cm/2,  L_cm/2, 0)
            lines.addByTwoPoints(p0, p1)
            lines.addByTwoPoints(p1, p2)
            lines.addByTwoPoints(p2, p3)
            lines.addByTwoPoints(p3, p0)

            # Port holes (simplified)
            port_r = 1.0  # 10mm ports
            circles = sk.sketchCurves.sketchCircles
            circles.addByCenterRadius(adsk.core.Point3D.create(-W_cm/2+2, -L_cm/2+2, 0), port_r)
            circles.addByCenterRadius(adsk.core.Point3D.create( W_cm/2-2, -L_cm/2+2, 0), port_r)
            circles.addByCenterRadius(adsk.core.Point3D.create(-W_cm/2+2,  L_cm/2-2, 0), port_r)
            circles.addByCenterRadius(adsk.core.Point3D.create( W_cm/2-2,  L_cm/2-2, 0), port_r)

            prof = sk.profiles.item(0)
            ext_inp = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
            ext_inp.setDistanceExtent(False, adsk.core.ValueInput.createByReal(t_cm))
            extrudes.add(ext_inp)

            z_current += t_cm + gap_cm  # next plate position

        # ── User Parameters ──────────────────────────────────
        params = des.userParameters
        for name, val, unit, comment in [
            ("PHX_NumPlates",  N_PLATES,       "",      "Number of plates"),
            ("PHX_Width_mm",   PLATE_W_MM,    "mm",    "Plate width"),
            ("PHX_Length_mm",  PLATE_L_MM,    "mm",    "Plate length"),
            ("PHX_Gap_mm",     GAP_MM,        "mm",    "Channel gap"),
            ("PHX_PackLen_mm", PACK_L_MM,     "mm",    "Pack length"),
            ("PHX_Area_m2",    AREA_REQ_M2,   "",      "Required area (m²)"),
            ("PHX_Duty_kW",    ${(results.Q / 1000).toFixed(2)}, "","Heat duty (kW)"),
            ("PHX_LMTD",       ${results.LMTD.toFixed(2)},       "", "LMTD (K)"),
            ("PHX_U",          ${g.U_design}, "", "Overall HTC (W/m²K)"),
        ]:
            expr = str(val) if not unit else f"{val} {unit}"
            existing = params.itemByName(name)
            if existing:
                existing.expression = expr
                existing.comment = comment
            else:
                params.add(name, adsk.core.ValueInput.createByString(expr), unit, comment)

        ui.messageBox(
            f"✅ Plate HX Created!\\n\\n"
            f"Plates:    ${n.n_plates} plates\\n"
            f"Size:      ${n.W_mm} × ${n.Lp_mm} mm\\n"
            f"Pack:      ${n.packLength_mm} mm\\n"
            f"Area:      ${n.A_required} m²\\n"
            f"Duty:      ${(results.Q / 1000).toFixed(2)} kW\\n"
            f"Effectiveness: ${(results.epsilon * 100).toFixed(1)}%",
            "Heat Exchanger Design Suite"
        )
    except:
        if ui:
            ui.messageBox("Error:\\n" + traceback.format_exc())
`;
  } else {
    fusionCode = `# Fusion 360 Script — ${HX_TYPES[hxType].name}
# Heat Duty: ${(results.Q / 1000).toFixed(2)} kW
# Area: ${g.A_required} m²
# Implement custom geometry per specifications below.
# Parameters JSON: see Design Parameters tab.
`;
  }

  return { python: fusionCode, json: JSON.stringify(jsonParams, null, 2) };
}

// ═══════════════════════════════════════════════════════════
//  VISUAL COMPONENTS
// ═══════════════════════════════════════════════════════════

function ShellTubeDiagram({ inputs, results }) {
  const g = results?.geometry;
  return (
    <svg viewBox="0 0 600 200" style={{ width: "100%", height: 200, background: "#0a0f1e" }}>
      {/* Shell */}
      <rect x="40" y="50" width="520" height="100" rx="8" fill="none" stroke="#3b82f6" strokeWidth="2" />
      <rect x="40" y="50" width="520" height="100" fill="#1e293b" opacity="0.6" />
      {/* Tubes */}
      {[0,1,2,3,4,5,6].map(i => (
        <line key={i} x1="40" y1={65 + i*13} x2="560" y2={65 + i*13} stroke="#f59e0b" strokeWidth="2" opacity="0.7"/>
      ))}
      {/* Baffles */}
      {[160, 260, 360, 460].map((x, i) => (
        <rect key={i} x={x} y={i % 2 === 0 ? 50 : 90} width="6" height={i % 2 === 0 ? 80 : 60} fill="#6366f1" opacity="0.8"/>
      ))}
      {/* Flow arrows - hot */}
      <text x="20" y="95" fill="#ef4444" fontSize="9" textAnchor="middle">HOT</text>
      <text x="20" y="108" fill="#ef4444" fontSize="9" textAnchor="middle">IN</text>
      <polygon points="38,100 28,95 28,105" fill="#ef4444" />
      <text x="580" y="95" fill="#ef4444" fontSize="9" textAnchor="middle">HOT</text>
      <text x="580" y="108" fill="#ef4444" fontSize="9" textAnchor="middle">OUT</text>
      <polygon points="562,100 572,95 572,105" fill="#ef4444" />
      {/* Flow - cold */}
      <text x="300" y="34" fill="#3b9eff" fontSize="9" textAnchor="middle">COLD FLUID IN ←</text>
      <text x="300" y="170" fill="#3b9eff" fontSize="9" textAnchor="middle">→ COLD FLUID OUT</text>
      <line x1="300" y1="38" x2="300" y2="50" stroke="#3b9eff" strokeWidth="1.5" strokeDasharray="3,3"/>
      {/* Labels */}
      <text x="300" y="185" fill="#475569" fontSize="8" textAnchor="middle">
        {g ? `${g.n_tubes} tubes × ⌀${g.d_o_mm}mm OD × ${g.L_m}m | Shell ID: ${g.D_shell_mm}mm | ${g.n_baffles} baffles` : "Shell & Tube HX"}
      </text>
      {inputs && (
        <>
          <text x="50" y="47" fill="#ef4444" fontSize="8">{inputs.T_h_in}°C</text>
          <text x="495" y="47" fill="#ef4444" fontSize="8">{inputs.T_h_out}°C</text>
          <text x="230" y="33" fill="#3b9eff" fontSize="8">{inputs.T_c_in}°C</text>
          <text x="320" y="33" fill="#3b9eff" fontSize="8">{inputs.T_c_out}°C</text>
        </>
      )}
    </svg>
  );
}

function PlateDiagram({ inputs, results }) {
  const g = results?.geometry;
  const n = Math.min(g?.n_plates || 8, 12);
  const W = 500 / n;
  return (
    <svg viewBox="0 0 600 200" style={{ width: "100%", height: 200, background: "#0a0f1e" }}>
      <text x="300" y="18" fill="#94a3b8" fontSize="9" textAnchor="middle">PLATE HEAT EXCHANGER — {g?.n_plates} plates × {g?.W_mm}mm × {g?.Lp_mm}mm</text>
      {Array.from({ length: n }).map((_, i) => (
        <rect key={i} x={50 + i * (W + 2)} y="30" width={W - 2} height="140"
          fill={i % 2 === 0 ? "#1e3a5f" : "#3b1a1a"} stroke={i % 2 === 0 ? "#3b82f6" : "#ef4444"} strokeWidth="1" rx="2"/>
      ))}
      <text x="20" y="100" fill="#3b9eff" fontSize="8" textAnchor="middle">COLD</text>
      <text x="580" y="100" fill="#ef4444" fontSize="8" textAnchor="middle">HOT</text>
      <polygon points="38,100 28,95 28,105" fill="#3b9eff"/>
      <polygon points="562,100 572,95 572,105" fill="#ef4444"/>
      <text x="150" y="190" fill="#3b9eff" fontSize="8">{inputs?.T_c_in}°C → {inputs?.T_c_out}°C</text>
      <text x="350" y="190" fill="#ef4444" fontSize="8">{inputs?.T_h_in}°C → {inputs?.T_h_out}°C</text>
    </svg>
  );
}

function DoublePipeDiagram({ inputs, results }) {
  const g = results?.geometry;
  return (
    <svg viewBox="0 0 600 200" style={{ width: "100%", height: 200, background: "#0a0f1e" }}>
      <rect x="40" y="60" width="520" height="80" rx="40" fill="none" stroke="#3b82f6" strokeWidth="3"/>
      <rect x="40" y="80" width="520" height="40" rx="20" fill="none" stroke="#f59e0b" strokeWidth="2"/>
      <text x="20" y="103" fill="#ef4444" fontSize="8">HOT</text>
      <text x="575" y="103" fill="#ef4444" fontSize="8">HOT</text>
      <text x="20" y="70" fill="#3b9eff" fontSize="8">COLD</text>
      <text x="575" y="70" fill="#3b9eff" fontSize="8">COLD</text>
      <polygon points="40,100 55,93 55,107" fill="#ef4444"/>
      <polygon points="560,100 545,93 545,107" fill="#3b9eff"/>
      <text x="300" y="185" fill="#475569" fontSize="8" textAnchor="middle">
        {g ? `${g.n_hairpins} hairpins | Inner: ⌀${g.d_i_mm}mm | Annulus: ⌀${g.D_ann_mm}mm | L: ${g.total_length_m}m total` : "Double Pipe HX"}
      </text>
      <text x="300" y="120" fill="#64748b" fontSize="8" textAnchor="middle">Counterflow Configuration</text>
      {inputs && (
        <>
          <text x="55" y="58" fill="#3b9eff" fontSize="8">{inputs.T_c_out}°C</text>
          <text x="495" y="58" fill="#3b9eff" fontSize="8">{inputs.T_c_in}°C</text>
          <text x="55" y="147" fill="#ef4444" fontSize="8">{inputs.T_h_in}°C</text>
          <text x="495" y="147" fill="#ef4444" fontSize="8">{inputs.T_h_out}°C</text>
        </>
      )}
    </svg>
  );
}

function TempProfileChart({ inputs, results }) {
  if (!inputs || !results) return null;
  const { T_h_in, T_h_out, T_c_in, T_c_out } = inputs;
  const allT = [T_h_in, T_h_out, T_c_in, T_c_out];
  const Tmin = Math.min(...allT) - 5;
  const Tmax = Math.max(...allT) + 5;
  const range = Tmax - Tmin;
  const W = 500, H = 160;
  const toY = (T) => H - ((T - Tmin) / range) * H;
  const isCounter = inputs.flow_config === "counterflow";

  const hotX1 = 30, hotX2 = W + 30;
  const hotY1 = toY(T_h_in), hotY2 = toY(T_h_out);
  const coldX1 = 30, coldX2 = W + 30;
  const coldY1 = isCounter ? toY(T_c_out) : toY(T_c_in);
  const coldY2 = isCounter ? toY(T_c_in) : toY(T_c_out);

  // Grid lines
  const gridLines = 5;
  const gridT = Array.from({ length: gridLines + 1 }, (_, i) => Tmin + (range / gridLines) * i);

  return (
    <svg viewBox={`0 0 ${W + 60} ${H + 50}`} style={{ width: "100%", background: "#0a0f1e", borderRadius: 8 }}>
      {/* Grid */}
      {gridT.map((T, i) => (
        <g key={i}>
          <line x1="55" y1={toY(T) + 10} x2={W + 30} y2={toY(T) + 10} stroke="#1e293b" strokeWidth="1"/>
          <text x="50" y={toY(T) + 14} fill="#475569" fontSize="8" textAnchor="end">{T.toFixed(0)}°</text>
        </g>
      ))}
      {/* Temp profiles */}
      <line x1={hotX1 + 25} y1={hotY1 + 10} x2={hotX2 - 25} y2={hotY2 + 10} stroke="#ef4444" strokeWidth="2.5"/>
      <line x1={coldX1 + 25} y1={coldY1 + 10} x2={coldX2 - 25} y2={coldY2 + 10} stroke="#3b9eff" strokeWidth="2.5"/>
      {/* Labels */}
      <circle cx={hotX1 + 25} cy={hotY1 + 10} r="4" fill="#ef4444"/>
      <circle cx={hotX2 - 25} cy={hotY2 + 10} r="4" fill="#ef4444"/>
      <circle cx={coldX1 + 25} cy={coldY1 + 10} r="4" fill="#3b9eff"/>
      <circle cx={coldX2 - 25} cy={coldY2 + 10} r="4" fill="#3b9eff"/>
      <text x={hotX1 + 25} y={hotY1 + 25} fill="#ef4444" fontSize="8">{T_h_in}°C</text>
      <text x={hotX2 - 30} y={hotY2 + 25} fill="#ef4444" fontSize="8">{T_h_out}°C</text>
      <text x={coldX1 + 25} y={coldY1 + 25} fill="#3b9eff" fontSize="8">{isCounter ? T_c_out : T_c_in}°C</text>
      <text x={coldX2 - 40} y={coldY2 + 25} fill="#3b9eff" fontSize="8">{isCounter ? T_c_in : T_c_out}°C</text>
      {/* Axis labels */}
      <text x="30" y={H + 42} fill="#94a3b8" fontSize="8">Flow Position →</text>
      <text x={W + 30} y={H + 42} fill="#475569" fontSize="8" textAnchor="end">Temp (°C)</text>
      {/* Legend */}
      <line x1="60" y1={H + 38} x2="80" y2={H + 38} stroke="#ef4444" strokeWidth="2"/>
      <text x="85" y={H + 42} fill="#ef4444" fontSize="8">Hot</text>
      <line x1="105" y1={H + 38} x2="125" y2={H + 38} stroke="#3b9eff" strokeWidth="2"/>
      <text x="130" y={H + 42} fill="#3b9eff" fontSize="8">Cold</text>
    </svg>
  );
}

function EffRadar({ results }) {
  if (!results) return null;
  const metrics = [
    { label: "Effectiveness", val: Math.min(results.epsilon * 100, 100), max: 100, color: "#22d3ee" },
    { label: "NTU Index", val: Math.min(results.NTU * 20, 100), max: 100, color: "#f59e0b" },
    { label: "Heat Balance", val: Math.max(0, 100 - results.imbalance * 5), max: 100, color: "#34d399" },
    { label: "LMTD Score", val: Math.min(results.LMTD * 2, 100), max: 100, color: "#a78bfa" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {metrics.map(m => (
        <div key={m.label} style={{ padding: "10px 12px", background: "#0d1424", borderRadius: 8, border: "1px solid #1e2a40" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, fontFamily: "monospace" }}>{m.label}</div>
          <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${m.val}%`, background: m.color, borderRadius: 3, transition: "width 0.8s" }}/>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: m.color, marginTop: 4, fontFamily: "monospace" }}>
            {m.val.toFixed(1)}{m.label === "Effectiveness" ? "%" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════

const DEFAULT_INPUTS = {
  hx_type: "shellTube", flow_config: "counterflow",
  fluid_h: "water", fluid_c: "water",
  T_h_in: 90, T_h_out: 55,
  T_c_in: 20, T_c_out: 60,
  mdot_h: 2.0, mdot_c: 1.5,
  material: "ss316L",
  fouling_h: 0.0002, fouling_c: 0.0002,
  tube_od_mm: 25.4, tube_id_mm: 21.2,
  tube_length_m: 4.0, n_tube_passes: 2, n_shell_passes: 1,
  plate_gap_mm: 3.0, plate_width_mm: 250, plate_length_mm: 500,
};

const FOULING_PRESETS = [
  { label: "River Water",    R: 0.0002 },
  { label: "Seawater",      R: 0.0001 },
  { label: "Boiler Feed",   R: 0.00005 },
  { label: "Cooling Tower", R: 0.00035 },
  { label: "Process Water", R: 0.0003 },
  { label: "Light Oil",     R: 0.0005 },
  { label: "Steam (clean)", R: 0.00001 },
];

export default function HeatExchangerApp() {
  const [inputs, setInputs]   = useState(DEFAULT_INPUTS);
  const [results, setResults] = useState(null);
  const [tab, setTab]         = useState("design");
  const [codeTab, setCodeTab] = useState("python");
  const [fusionCode, setFusionCode] = useState(null);
  const [error, setError]     = useState("");
  const [pulse, setPulse]     = useState(false);

  const upd = (k, v) => setInputs(p => ({ ...p, [k]: v }));

  const calculate = useCallback(() => {
    setError("");
    try {
      const T = {
        ...inputs,
        T_h_in: Number(inputs.T_h_in), T_h_out: Number(inputs.T_h_out),
        T_c_in: Number(inputs.T_c_in), T_c_out: Number(inputs.T_c_out),
        mdot_h: Number(inputs.mdot_h), mdot_c: Number(inputs.mdot_c),
        fouling_h: Number(inputs.fouling_h), fouling_c: Number(inputs.fouling_c),
        tube_od_mm: Number(inputs.tube_od_mm), tube_id_mm: Number(inputs.tube_id_mm),
        tube_length_m: Number(inputs.tube_length_m),
        plate_gap_mm: Number(inputs.plate_gap_mm),
        plate_width_mm: Number(inputs.plate_width_mm),
        plate_length_mm: Number(inputs.plate_length_mm),
      };
      if (T.T_h_out >= T.T_h_in) { setError("Hot outlet must be < hot inlet temperature."); return; }
      if (T.T_c_out <= T.T_c_in) { setError("Cold outlet must be > cold inlet temperature."); return; }
      if (T.T_h_out <= T.T_c_in + 2) { setError("Temperature cross detected! Check temperatures."); return; }
      const r = performThermalCalc(T);
      if (!r) { setError("Calculation failed. Check fluid selection."); return; }
      setResults(r);
      
      const generatedCode = generateFusionScript(T, r);
      setFusionCode(generatedCode);
      
      // Auto-export script to local Express server for Fusion 360
      fetch('http://localhost:3001/api/export-fusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pythonCode: generatedCode.python })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          console.log('Fusion 360 script auto-exported successfully!');
        } else {
          console.error('Export error:', data.error);
        }
      })
      .catch(err => console.error('Failed to connect to export server:', err));

      setPulse(true);
      setTimeout(() => setPulse(false), 600);
      setTab("results");
    } catch (e) {
      setError("Calculation error: " + e.message);
    }
  }, [inputs]);

  const hxDef = HX_TYPES[inputs.hx_type];
  const mat   = MATERIALS[inputs.material];

  const Input = ({ label, k, type = "number", min, max, step, unit, readOnly, children }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>
        {label}{unit && <span style={{ color: "#f59e0b", marginLeft: 4 }}>[{unit}]</span>}
      </label>
      {children || (
        <input type={type} min={min} max={max} step={step || 0.1}
          value={inputs[k]} readOnly={readOnly}
          onChange={e => upd(k, type === "number" ? Number(e.target.value) : e.target.value)}
          style={{ width: "100%", padding: "8px 10px", background: "#0d1424", border: "1px solid #1e2a40", borderRadius: 6, color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
        />
      )}
    </div>
  );

  const Select = ({ label, k, options, getValue, getLabel }) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>{label}</label>
      <select value={inputs[k]} onChange={e => upd(k, e.target.value)}
        style={{ width: "100%", padding: "8px 10px", background: "#0d1424", border: "1px solid #1e2a40", borderRadius: 6, color: "#e2e8f0", fontSize: 12, fontFamily: "monospace", outline: "none" }}>
        {options.map(o => <option key={getValue(o)} value={getValue(o)}>{getLabel(o)}</option>)}
      </select>
    </div>
  );

  const ResultBox = ({ label, value, unit, color = "#f59e0b", big }) => (
    <div style={{ padding: "10px 12px", background: "#0d1424", borderRadius: 8, border: `1px solid ${color}25`, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 16, fontWeight: 700, color, fontFamily: "monospace", marginTop: 2 }}>
        {value} <span style={{ fontSize: big ? 12 : 10, color: "#64748b" }}>{unit}</span>
      </div>
    </div>
  );

  const DiagramComp = inputs.hx_type === "plateFin" || inputs.hx_type === "brazedPlate"
    ? PlateDiagram
    : inputs.hx_type === "doublePipe"
    ? DoublePipeDiagram
    : ShellTubeDiagram;

  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", background: "#080c18", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0a0f1e; } ::-webkit-scrollbar-thumb { background: #1e2a40; border-radius: 3px; }
        input:focus, select:focus { border-color: #f59e0b !important; box-shadow: 0 0 0 2px rgba(245,158,11,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0c1d3e,#0a0f1e)", borderBottom: "1px solid #1e2a40", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 0 20px rgba(245,158,11,0.3)" }}>⚙</div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.25em", color: "#f59e0b", textTransform: "uppercase" }}>Engineering Design Suite</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", letterSpacing: "0.04em" }}>Heat Exchanger Designer</div>
            <div style={{ fontSize: 10, color: "#334155", letterSpacing: "0.15em" }}>WITH AUTODESK FUSION 360 CAD EXPORT</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            ["LMTD", results ? results.LMTD.toFixed(1) + " K" : "—"],
            ["ε",    results ? (results.epsilon * 100).toFixed(1) + "%" : "—"],
            ["Q",    results ? (results.Q / 1000).toFixed(2) + " kW" : "—"],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: "center", borderLeft: "1px solid #1e2a40", paddingLeft: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace" }}>{v}</div>
              <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ background: "#0a0f1e", borderBottom: "1px solid #1e2a40", display: "flex", padding: "0 24px" }}>
        {[
          { id: "design",   label: "⚙ Design Inputs" },
          { id: "results",  label: "📊 Results & Analysis" },
          { id: "geometry", label: "📐 Geometry" },
          { id: "fusion",   label: "🔩 Fusion 360 Export" },
          { id: "materials",label: "🔧 Material Library" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "12px 20px", border: "none", background: "transparent", color: tab === t.id ? "#f59e0b" : "#475569", borderBottom: `2px solid ${tab === t.id ? "#f59e0b" : "transparent"}`, cursor: "pointer", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", transition: "all 0.2s" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 130px)" }}>

        {/* ── LEFT PANEL — always visible inputs ── */}
        <div style={{ width: 300, background: "#0a0f1e", borderRight: "1px solid #1e2a40", padding: 20, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#f59e0b", textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span>●</span> QUICK INPUTS
          </div>

          {/* HX Type */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Heat Exchanger Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {Object.entries(HX_TYPES).map(([k, v]) => (
                <div key={k} onClick={() => upd("hx_type", k)}
                  style={{ padding: "7px 8px", borderRadius: 6, border: `1px solid ${inputs.hx_type === k ? "#f59e0b" : "#1e2a40"}`, background: inputs.hx_type === k ? "rgba(245,158,11,0.1)" : "#0d1424", cursor: "pointer", fontSize: 10, color: inputs.hx_type === k ? "#f59e0b" : "#64748b", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 14 }}>{v.icon}</div>
                  <div style={{ marginTop: 2 }}>{v.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow Config */}
          <Select label="Flow Configuration" k="flow_config"
            options={Object.entries(FLOW_CONFIGS)} getValue={([k]) => k} getLabel={([k, v]) => `${v.name} (F=${v.F})`} />

          {/* Fluids */}
          <Select label="Hot Side Fluid" k="fluid_h"
            options={Object.entries(FLUIDS)} getValue={([k]) => k} getLabel={([k, v]) => `${v.icon} ${v.name}`} />
          <Select label="Cold Side Fluid" k="fluid_c"
            options={Object.entries(FLUIDS)} getValue={([k]) => k} getLabel={([k, v]) => `${v.icon} ${v.name}`} />

          {/* Temperatures */}
          <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: "0.1em", marginBottom: 8, marginTop: 4 }}>— HOT STREAM —</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="T_h_in"  k="T_h_in"  unit="°C" step={0.5}/>
            <Input label="T_h_out" k="T_h_out" unit="°C" step={0.5}/>
          </div>
          <Input label="ṁ hot" k="mdot_h" unit="kg/s" min={0.01} step={0.1}/>

          <div style={{ fontSize: 10, color: "#3b9eff", letterSpacing: "0.1em", marginBottom: 8, marginTop: 4 }}>— COLD STREAM —</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="T_c_in"  k="T_c_in"  unit="°C" step={0.5}/>
            <Input label="T_c_out" k="T_c_out" unit="°C" step={0.5}/>
          </div>
          <Input label="ṁ cold" k="mdot_c" unit="kg/s" min={0.01} step={0.1}/>

          {/* Material */}
          <Select label="Construction Material" k="material"
            options={Object.entries(MATERIALS)} getValue={([k]) => k} getLabel={([k, v]) => `${v.icon} ${v.name}`} />

          {/* Fouling */}
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Fouling Resistance (m²K/W)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Hot side" k="fouling_h" step={0.00001}/>
            <Input label="Cold side" k="fouling_c" step={0.00001}/>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
            {FOULING_PRESETS.slice(0, 4).map(f => (
              <span key={f.label} onClick={() => upd("fouling_c", f.R)}
                style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#0d1424", border: "1px solid #1e2a40", color: "#64748b", cursor: "pointer" }}>
                {f.label}
              </span>
            ))}
          </div>

          {error && (
            <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: 11, color: "#ef4444", marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

          <button onClick={calculate}
            style={{ width: "100%", padding: "13px", background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 8, color: "#0a0f1e", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", fontFamily: "monospace", boxShadow: "0 4px 20px rgba(245,158,11,0.35)", animation: pulse ? "pulse 0.6s" : "none" }}>
            ⚡ CALCULATE &amp; DESIGN
          </button>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>

          {/* ── DESIGN TAB ── */}
          {tab === "design" && (
            <div>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 16 }}>
                ● {hxDef.name} — Advanced Parameters
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                {/* Geometry */}
                <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                  <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.15em", marginBottom: 12 }}>TUBE GEOMETRY</div>
                  <Input label="Tube OD" k="tube_od_mm" unit="mm" min={6} max={100}/>
                  <Input label="Tube ID" k="tube_id_mm" unit="mm" min={4} max={95}/>
                  <Input label="Tube Length" k="tube_length_m" unit="m" min={0.5} max={10} step={0.5}/>
                  <Input label="Tube Passes" k="n_tube_passes" unit="" min={1} max={8} step={1}/>
                  <Input label="Shell Passes" k="n_shell_passes" unit="" min={1} max={4} step={1}/>
                </div>

                {/* Plate geometry */}
                <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                  <div style={{ fontSize: 10, color: "#3b9eff", letterSpacing: "0.15em", marginBottom: 12 }}>PLATE GEOMETRY</div>
                  <Input label="Channel Gap" k="plate_gap_mm" unit="mm" min={1} max={10}/>
                  <Input label="Plate Width" k="plate_width_mm" unit="mm" min={50} max={2000}/>
                  <Input label="Plate Length" k="plate_length_mm" unit="mm" min={100} max={3000}/>
                  <div style={{ marginTop: 8, padding: "8px 10px", background: "#080c18", borderRadius: 6, fontSize: 10, color: "#475569" }}>
                    Area/plate: {((inputs.plate_width_mm / 1000) * (inputs.plate_length_mm / 1000)).toFixed(4)} m²
                  </div>
                </div>

                {/* Selected config summary */}
                <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                  <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: "0.15em", marginBottom: 12 }}>CONFIGURATION</div>
                  <div style={{ padding: "10px", background: "#080c18", borderRadius: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 20, textAlign: "center", marginBottom: 6 }}>{hxDef.icon}</div>
                    <div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700, textAlign: "center" }}>{hxDef.name}</div>
                    <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>{hxDef.desc}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>U-range:</div>
                  <div style={{ fontSize: 13, color: "#f59e0b", fontFamily: "monospace" }}>
                    {hxDef.U_range[0]}–{hxDef.U_range[1]} W/m²K
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 8, marginBottom: 6 }}>F-factor:</div>
                  <div style={{ fontSize: 13, color: "#22d3ee", fontFamily: "monospace" }}>{hxDef.F_factor}</div>
                  <div style={{ marginTop: 12, padding: "8px", background: `${mat.color}15`, border: `1px solid ${mat.color}30`, borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: "#475569" }}>Material</div>
                    <div style={{ fontSize: 11, color: "#f1f5f9", marginTop: 2 }}>{mat.name}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>k = {mat.k} W/m·K · Max {mat.maxT}°C</div>
                  </div>
                </div>
              </div>

              {/* Fluid Properties Preview */}
              <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                <div style={{ fontSize: 10, color: "#34d399", letterSpacing: "0.15em", marginBottom: 12 }}>FLUID THERMOPHYSICAL PROPERTIES (at mean temperatures)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {["fluid_h", "fluid_c"].map(fk => {
                    const T_mean = fk === "fluid_h" ? (inputs.T_h_in + inputs.T_h_out) / 2 : (inputs.T_c_in + inputs.T_c_out) / 2;
                    const props = calcFluidProps(inputs[fk], T_mean);
                    const fl = FLUIDS[inputs[fk]];
                    return props ? (
                      <div key={fk} style={{ background: "#080c18", borderRadius: 8, padding: "12px 14px", border: `1px solid ${fk === "fluid_h" ? "#ef444420" : "#3b9eff20"}` }}>
                        <div style={{ fontSize: 11, color: fk === "fluid_h" ? "#ef4444" : "#3b9eff", marginBottom: 8 }}>
                          {fl.icon} {fl.name} @ {T_mean.toFixed(1)}°C
                        </div>
                        {[
                          ["Cp",  props.Cp.toFixed(1),  "J/kg·K"],
                          ["ρ",   props.rho.toFixed(1),  "kg/m³"],
                          ["μ",   (props.mu * 1000).toFixed(4), "mPa·s"],
                          ["k",   props.k.toFixed(4),    "W/m·K"],
                          ["Pr",  props.Pr.toFixed(2),   "—"],
                        ].map(([l, v, u]) => (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{l}</span>
                            <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "monospace" }}>{v} <span style={{ color: "#334155" }}>{u}</span></span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── RESULTS TAB ── */}
          {tab === "results" && (
            <div>
              {!results ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 12, color: "#334155" }}>
                  <div style={{ fontSize: 48 }}>⚙</div>
                  <div style={{ fontSize: 14 }}>Run calculation to see results</div>
                  <button onClick={calculate} style={{ padding: "10px 24px", background: "#f59e0b", border: "none", borderRadius: 6, color: "#0a0f1e", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>⚡ CALCULATE NOW</button>
                </div>
              ) : (
                <div>
                  {/* Diagram */}
                  <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #1e2a40" }}>
                    <DiagramComp inputs={inputs} results={results}/>
                  </div>

                  {/* Primary Results */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                    <ResultBox label="Heat Duty Q" value={(results.Q / 1000).toFixed(3)} unit="kW" color="#f59e0b" big/>
                    <ResultBox label="LMTD" value={results.LMTD.toFixed(2)} unit="K" color="#22d3ee" big/>
                    <ResultBox label="Effectiveness ε" value={(results.epsilon * 100).toFixed(1)} unit="%" color="#34d399" big/>
                    <ResultBox label="NTU" value={results.NTU.toFixed(3)} unit="—" color="#a78bfa" big/>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    {/* Thermal results */}
                    <div style={{ background: "#0d1424", borderRadius: 10, padding: 14, border: "1px solid #1e2a40" }}>
                      <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.15em", marginBottom: 10 }}>THERMAL ANALYSIS</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <ResultBox label="Q_hot" value={(results.Q_h / 1000).toFixed(3)} unit="kW" color="#ef4444"/>
                        <ResultBox label="Q_cold" value={(results.Q_c / 1000).toFixed(3)} unit="kW" color="#3b9eff"/>
                        <ResultBox label="C_hot" value={results.C_h.toFixed(1)} unit="W/K" color="#ef4444"/>
                        <ResultBox label="C_cold" value={results.C_c.toFixed(1)} unit="W/K" color="#3b9eff"/>
                        <ResultBox label="C_min" value={results.C_min.toFixed(1)} unit="W/K" color="#64748b"/>
                        <ResultBox label="C_r" value={results.C_r.toFixed(3)} unit="—" color="#64748b"/>
                        <ResultBox label="Q_max" value={(results.Q_max / 1000).toFixed(3)} unit="kW" color="#a78bfa"/>
                        <ResultBox label="Imbalance" value={results.imbalance.toFixed(2)} unit="%" color={results.imbalance > 5 ? "#ef4444" : "#34d399"}/>
                      </div>
                    </div>

                    {/* Performance indicators */}
                    <div style={{ background: "#0d1424", borderRadius: 10, padding: 14, border: "1px solid #1e2a40" }}>
                      <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: "0.15em", marginBottom: 10 }}>PERFORMANCE INDICATORS</div>
                      <EffRadar results={results}/>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <ResultBox label="LMTD × F" value={results.LMTD_eff.toFixed(2)} unit="K" color="#22d3ee"/>
                        <ResultBox label="U-overall" value={results.geometry.U_design} unit="W/m²K" color="#f59e0b"/>
                        <ResultBox label="Area req'd" value={results.geometry.A_required} unit="m²" color="#34d399"/>
                        <ResultBox label="ΔP hot" value={results.dP_h} unit="Pa" color="#ef4444"/>
                      </div>
                    </div>
                  </div>

                  {/* Temperature Profile Chart */}
                  <div style={{ background: "#0d1424", borderRadius: 10, padding: 14, border: "1px solid #1e2a40", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: "#34d399", letterSpacing: "0.15em", marginBottom: 10 }}>TEMPERATURE PROFILE</div>
                    <TempProfileChart inputs={inputs} results={results}/>
                  </div>

                  {/* Energy balance */}
                  <div style={{ padding: "12px 16px", background: results.imbalance < 5 ? "rgba(34,211,153,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${results.imbalance < 5 ? "#34d39940" : "#ef444440"}`, borderRadius: 8, fontSize: 12, color: results.imbalance < 5 ? "#34d399" : "#ef4444", fontFamily: "monospace" }}>
                    {results.imbalance < 5 ? "✓" : "⚠"} Energy Balance: Q_hot = {(results.Q_h / 1000).toFixed(3)} kW | Q_cold = {(results.Q_c / 1000).toFixed(3)} kW | Imbalance = {results.imbalance.toFixed(2)}% {results.imbalance < 5 ? "(Acceptable)" : "(Check inputs — may need to adjust mass flow rates)"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GEOMETRY TAB ── */}
          {tab === "geometry" && (
            <div>
              {!results ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#334155", fontSize: 13 }}>Run calculation first →</div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.2em", marginBottom: 16, textTransform: "uppercase" }}>
                    ● {HX_TYPES[inputs.hx_type].name} — Mechanical Design
                  </div>
                  <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #1e2a40" }}>
                    <DiagramComp inputs={inputs} results={results}/>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                      <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.15em", marginBottom: 12 }}>DIMENSIONAL DATA</div>
                      {Object.entries(results.geometry)
                        .filter(([k]) => k !== "type")
                        .map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #0d1424" }}>
                            <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", textTransform: "uppercase" }}>{k.replace(/_/g," ")}</span>
                            <span style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace" }}>{v}</span>
                          </div>
                        ))}
                    </div>

                    <div>
                      <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40", marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: "#22d3ee", letterSpacing: "0.15em", marginBottom: 12 }}>FLOW DATA</div>
                        {results.geometry.Re_tube && [
                          ["Re (tube)", results.geometry.Re_tube, Number(results.geometry.Re_tube) > 10000 ? "Turbulent" : Number(results.geometry.Re_tube) > 2300 ? "Transition" : "Laminar"],
                          ["Re (shell)", results.geometry.Re_shell || results.geometry.Re_h, ""],
                          ["h_i (W/m²K)", results.geometry.h_i, "Tube-side HTC"],
                          ["h_o (W/m²K)", results.geometry.h_o, "Shell-side HTC"],
                        ].map(([l, v, r]) => (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: "#64748b" }}>{l}</span>
                            <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "monospace" }}>{v} <span style={{ color: "#334155" }}>{r}</span></span>
                          </div>
                        ))}
                      </div>

                      <div style={{ background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                        <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: "0.15em", marginBottom: 12 }}>MATERIAL — {mat.name}</div>
                        {[
                          ["Thermal cond.", mat.k + " W/m·K"],
                          ["Density", mat.rhoM + " kg/m³"],
                          ["Tensile strength", mat.sigma + " MPa"],
                          ["Max temperature", mat.maxT + " °C"],
                          ["Corrosion resist.", mat.corr],
                          ["Relative cost", "×" + mat.cost + " /kg"],
                        ].map(([l, v]) => (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ fontSize: 10, color: "#64748b" }}>{l}</span>
                            <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "monospace", textAlign: "right" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FUSION 360 TAB ── */}
          {tab === "fusion" && (
            <div>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.2em", marginBottom: 16, textTransform: "uppercase" }}>
                ● Autodesk Fusion 360 — CAD Customization Export
              </div>

              {!fusionCode ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔩</div>
                  <div style={{ fontSize: 14, marginBottom: 20 }}>Calculate design first to generate Fusion 360 scripts</div>
                  <button onClick={calculate} style={{ padding: "10px 24px", background: "#f59e0b", border: "none", borderRadius: 6, color: "#0a0f1e", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>⚡ CALCULATE & GENERATE</button>
                </div>
              ) : (
                <div>
                  {/* Workflow steps */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                    {[
                      { n: "1", label: "Copy Python Script", desc: "Copy from editor below" },
                      { n: "2", label: "Open Fusion 360", desc: "Launch Autodesk Fusion 360" },
                      { n: "3", label: "Tools → Scripts", desc: "Open Script Manager" },
                      { n: "4", label: "New → Python", desc: "Create new Python script" },
                      { n: "5", label: "Paste & Run", desc: "Paste code and click Run" },
                    ].map(s => (
                      <div key={s.n} style={{ flex: 1, padding: "10px 12px", background: "#0d1424", borderRadius: 8, border: "1px solid #1e2a40", textAlign: "center" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b", color: "#0a0f1e", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px", fontFamily: "monospace" }}>{s.n}</div>
                        <div style={{ fontSize: 10, color: "#e2e8f0", fontWeight: 700 }}>{s.label}</div>
                        <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Code tabs */}
                  <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
                    {[["python", "🐍 Fusion 360 Python API"], ["json", "📄 Design Parameters JSON"]].map(([k, l]) => (
                      <button key={k} onClick={() => setCodeTab(k)}
                        style={{ padding: "9px 18px", border: `1px solid ${codeTab === k ? "#f59e0b" : "#1e2a40"}`, borderBottom: "none", borderRadius: "6px 6px 0 0", background: codeTab === k ? "#0d1424" : "#080c18", color: codeTab === k ? "#f59e0b" : "#475569", fontSize: 11, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                        {l}
                      </button>
                    ))}
                    <div style={{ flex: 1, borderBottom: "1px solid #1e2a40" }}/>
                    <button onClick={() => {
                      const code = codeTab === "python" ? fusionCode.python : fusionCode.json;
                      navigator.clipboard?.writeText(code);
                    }} style={{ padding: "8px 16px", background: "rgba(245,158,11,0.15)", border: "1px solid #f59e0b40", borderBottom: "none", borderRadius: "6px 6px 0 0", color: "#f59e0b", fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.1em" }}>
                      📋 COPY TO CLIPBOARD
                    </button>
                  </div>
                  <div style={{ background: "#0d1424", border: "1px solid #1e2a40", borderRadius: "0 0 10px 10px", padding: 0, overflow: "hidden" }}>
                    <pre style={{ margin: 0, padding: 16, fontSize: 11, color: "#a5f3fc", lineHeight: 1.6, overflowX: "auto", maxHeight: 480, overflowY: "auto", fontFamily: "monospace" }}>
                      <code>{codeTab === "python" ? fusionCode.python : fusionCode.json}</code>
                    </pre>
                  </div>

                  {/* Fusion 360 User Parameters preview */}
                  <div style={{ marginTop: 16, background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                    <div style={{ fontSize: 10, color: "#34d399", letterSpacing: "0.15em", marginBottom: 12 }}>FUSION 360 USER PARAMETERS (auto-injected by script)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {[
                        ["HX_Duty_kW", (results?.Q / 1000).toFixed(2), "kW"],
                        ["HX_LMTD_K", results?.LMTD.toFixed(2), "K"],
                        ["HX_U_W_m2K", results?.geometry.U_design, "W/m²K"],
                        ["HX_Area_m2", results?.geometry.A_required, "m²"],
                        ["HX_Effectiveness", (results?.epsilon * 100).toFixed(1), "%"],
                        ["HX_NTU", results?.NTU.toFixed(3), "—"],
                      ].map(([name, val, unit]) => (
                        <div key={name} style={{ padding: "8px 10px", background: "#080c18", borderRadius: 6 }}>
                          <div style={{ fontSize: 9, color: "#64748b" }}>{name}</div>
                          <div style={{ fontSize: 13, color: "#34d399", fontFamily: "monospace" }}>{val} <span style={{ fontSize: 9, color: "#334155" }}>{unit}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MATERIALS TAB ── */}
          {tab === "materials" && (
            <div>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: "0.2em", marginBottom: 16, textTransform: "uppercase" }}>
                ● Material Selection Guide
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                {Object.entries(MATERIALS).map(([k, m]) => (
                  <div key={k} onClick={() => upd("material", k)}
                    style={{ padding: "14px 16px", borderRadius: 10, border: `1.5px solid ${inputs.material === k ? m.color : "#1e2a40"}`, background: inputs.material === k ? `${m.color}10` : "#0d1424", cursor: "pointer", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: inputs.material === k ? m.color : "#e2e8f0" }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>Code: {m.code}</div>
                      </div>
                      {inputs.material === k && <span style={{ fontSize: 11, color: m.color }}>✓ Selected</span>}
                    </div>
                    {[
                      ["Thermal conductivity", m.k + " W/m·K"],
                      ["Tensile strength", m.sigma + " MPa"],
                      ["Density", m.rhoM + " kg/m³"],
                      ["Max temp.", m.maxT + "°C"],
                      ["Corrosion resistance", m.corr],
                      ["Relative cost index", "×" + m.cost],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "#475569" }}>{l}</span>
                        <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{v}</span>
                      </div>
                    ))}
                    {/* Cost indicator */}
                    <div style={{ marginTop: 8, height: 4, background: "#080c18", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (m.cost / 50) * 100)}%`, background: m.color, borderRadius: 2 }}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fouling presets */}
              <div style={{ marginTop: 20, background: "#0d1424", borderRadius: 10, padding: 16, border: "1px solid #1e2a40" }}>
                <div style={{ fontSize: 10, color: "#22d3ee", letterSpacing: "0.15em", marginBottom: 12, textTransform: "uppercase" }}>Fouling Resistance Reference (TEMA Standards)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {FOULING_PRESETS.map(f => (
                    <div key={f.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "#080c18", borderRadius: 6 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{f.label}</span>
                      <span style={{ fontSize: 11, color: "#22d3ee", fontFamily: "monospace" }}>{f.R.toExponential(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
