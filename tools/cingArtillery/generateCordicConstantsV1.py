#!/usr/bin/env python3

"""
CING PIU PIU / CING ARTILLERY
CORDIC CONSTANTS V1 OFFLINE GENERATOR

Canonical algorithm identity:

  trig_algorithm_version = 1
  cordic_iterations      = 32
  trig_angle_scale       = 1_000_000_000 units / degree
  trig_value_scale       = 1_000_000_000 units / 1.0

Generation authority:

  Python standard library only
  Decimal high precision
  ROUND_HALF_EVEN

No:
  math.atan
  math.sin
  math.cos
  numpy
  scipy
  mpmath
  sympy
  network
  runtime dependency

Generation is independently evaluated at two precision levels.
Both results must produce exactly the same integer semantic constants.

The generated JavaScript artifact is committed and production
runtime consumes that integer-only artifact. Python is never part
of gameplay runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys

from decimal import (
    Decimal,
    ROUND_HALF_EVEN,
    localcontext,
)

from pathlib import Path


TRIG_ALGORITHM_VERSION_V1 = 1
CORDIC_ITERATIONS_V1 = 32

TRIG_ANGLE_SCALE_V1 = 1_000_000_000
TRIG_VALUE_SCALE_V1 = 1_000_000_000

GENERATION_PRECISIONS = (
    140,
    200,
)

OUTPUT_PATH = Path(
    "services/games/cingArtillery/domain/"
    "cingArtilleryCordicConstantsV1.generated.js"
)


def atan_series(
    x: Decimal,
    *,
    precision: int,
) -> Decimal:
    """
    Gregory series:

      atan(x) =
        x
        - x^3 / 3
        + x^5 / 5
        - ...

    This generator calls the series only with 0 <= x < 1.

    CORDIC:
      i >= 1 => x <= 1/2

    Machin pi:
      x = 1/5
      x = 1/239
    """

    if x == 0:
        return Decimal(0)

    if x < 0:
        return -atan_series(
            -x,
            precision=precision,
        )

    if x >= 1:
        raise ValueError(
            "atan_series requires 0 <= x < 1"
        )

    x_squared = (
        x * x
    )

    power = x
    total = Decimal(0)

    index = 0
    sign = 1

    threshold = (
        Decimal(1).scaleb(
            -(precision + 20)
        )
    )

    while True:
        denominator = Decimal(
            2 * index + 1
        )

        contribution = (
            power /
            denominator
        )

        if sign < 0:
            contribution = (
                -contribution
            )

        total += contribution

        if (
            abs(contribution) <
            threshold
        ):
            return +total

        power *= x_squared

        sign = -sign
        index += 1


def machin_pi(
    *,
    precision: int,
) -> Decimal:
    """
    Machin identity:

      pi =
        16 * atan(1/5)
        -
         4 * atan(1/239)
    """

    one = Decimal(1)

    return +(
        Decimal(16)
        *
        atan_series(
            one / Decimal(5),
            precision=precision,
        )
        -
        Decimal(4)
        *
        atan_series(
            one / Decimal(239),
            precision=precision,
        )
    )


def round_half_even_integer(
    value: Decimal,
) -> int:
    return int(
        value.quantize(
            Decimal(1),
            rounding=ROUND_HALF_EVEN,
        )
    )


def generate_semantic_constants(
    *,
    precision: int,
) -> dict:
    with localcontext() as context:
        context.prec = (
            precision + 40
        )

        pi = machin_pi(
            precision=precision,
        )

        angle_scale = Decimal(
            TRIG_ANGLE_SCALE_V1
        )

        value_scale = Decimal(
            TRIG_VALUE_SCALE_V1
        )

        atan_units = []

        for iteration in range(
            CORDIC_ITERATIONS_V1
        ):
            if iteration == 0:
                angle_radians = (
                    pi /
                    Decimal(4)
                )
            else:
                ratio = (
                    Decimal(1)
                    /
                    (
                        Decimal(2)
                        **
                        iteration
                    )
                )

                angle_radians = (
                    atan_series(
                        ratio,
                        precision=precision,
                    )
                )

            angle_degrees = (
                angle_radians
                *
                Decimal(180)
                /
                pi
            )

            atan_units.append(
                round_half_even_integer(
                    angle_degrees
                    *
                    angle_scale
                )
            )

        inverse_gain = Decimal(1)

        for iteration in range(
            CORDIC_ITERATIONS_V1
        ):
            squared_rotation = (
                Decimal(2)
                **
                (-2 * iteration)
            )

            rotation_gain = (
                Decimal(1)
                +
                squared_rotation
            ).sqrt()

            inverse_gain /= (
                rotation_gain
            )

        inverse_gain_units = (
            round_half_even_integer(
                inverse_gain
                *
                value_scale
            )
        )

        return {
            "trig_algorithm_version":
                TRIG_ALGORITHM_VERSION_V1,

            "cordic_iterations":
                CORDIC_ITERATIONS_V1,

            "trig_angle_scale":
                TRIG_ANGLE_SCALE_V1,

            "trig_value_scale":
                TRIG_VALUE_SCALE_V1,

            "generation_rounding":
                "ROUND_HALF_EVEN",

            "atan_deg_units":
                atan_units,

            "inverse_gain_value_units":
                inverse_gain_units,
        }


def verify_precision_stability() -> dict:
    results = [
        generate_semantic_constants(
            precision=precision,
        )
        for precision
        in GENERATION_PRECISIONS
    ]

    canonical = (
        results[0]
    )

    for position in range(
        1,
        len(results),
    ):
        candidate = (
            results[position]
        )

        if candidate != canonical:
            raise RuntimeError(
                "CORDIC constants unstable between "
                f"Decimal precision "
                f"{GENERATION_PRECISIONS[0]} and "
                f"{GENERATION_PRECISIONS[position]}"
            )

    return canonical


def semantic_checksum(
    semantic: dict,
) -> str:
    canonical_json = (
        json.dumps(
            semantic,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        .encode(
            "utf-8"
        )
    )

    return (
        hashlib.sha256(
            canonical_json
        )
        .hexdigest()
    )


def render_generated_js(
    semantic: dict,
) -> str:
    checksum = (
        semantic_checksum(
            semantic
        )
    )

    atan_lines = (
        "\n".join(
            f"  {value}n,"
            for value
            in semantic[
                "atan_deg_units"
            ]
        )
    )

    return f'''"use strict";

/*
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Generator:
 *   tools/cingArtillery/generateCordicConstantsV1.py
 *
 * CING PIU PIU / CING ARTILLERY
 * DETERMINISTIC CORDIC CONSTANTS V1
 *
 * trig_algorithm_version:
 *   {semantic["trig_algorithm_version"]}
 *
 * cordic_iterations:
 *   {semantic["cordic_iterations"]}
 *
 * trig_angle_scale:
 *   {semantic["trig_angle_scale"]} units / degree
 *
 * trig_value_scale:
 *   {semantic["trig_value_scale"]} units / 1.0
 *
 * generation_rounding:
 *   {semantic["generation_rounding"]}
 *
 * Runtime authority:
 *   immutable BigInt constants only
 *
 * No floating-point trig authority exists here.
 */

const CORDIC_ATAN_DEG_UNITS_V1 =
  Object.freeze([
{atan_lines}
  ]);

const CORDIC_INVERSE_GAIN_VALUE_UNITS_V1 =
  {semantic["inverse_gain_value_units"]}n;

const CORDIC_CONSTANTS_V1_SEMANTIC_SHA256 =
  "{checksum}";

module.exports = {{
  CORDIC_ATAN_DEG_UNITS_V1,
  CORDIC_INVERSE_GAIN_VALUE_UNITS_V1,
  CORDIC_CONSTANTS_V1_SEMANTIC_SHA256,
}};
'''


def main() -> int:
    parser = (
        argparse.ArgumentParser()
    )

    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Verify committed generated artifact "
            "against deterministic regeneration"
        ),
    )

    args = (
        parser.parse_args()
    )

    semantic = (
        verify_precision_stability()
    )

    rendered = (
        render_generated_js(
            semantic
        )
    )

    if args.check:
        if not OUTPUT_PATH.exists():
            print(
                "FAIL: generated CORDIC "
                f"artifact missing: {OUTPUT_PATH}",
                file=sys.stderr,
            )

            return 1

        current = (
            OUTPUT_PATH.read_text(
                encoding="utf-8"
            )
        )

        if current != rendered:
            print(
                "FAIL: committed CORDIC constants "
                "do not match deterministic regeneration",
                file=sys.stderr,
            )

            return 1

        print(
            "PASS: CORDIC Constants V1 "
            "byte-for-byte regeneration verified"
        )

        return 0

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT_PATH.write_text(
        rendered,
        encoding="utf-8",
    )

    print(
        f"PASS: generated {OUTPUT_PATH}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
