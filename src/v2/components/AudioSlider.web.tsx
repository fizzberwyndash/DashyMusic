import React, { useRef, useState } from "react";
import { View } from "react-native";
import type { SliderProps } from "@react-native-community/slider";

/** Keep the native slider on iPhone and provide real range/keyboard semantics on web. */
export default function AudioSlider(props: SliderProps) {
  const minimum = props.minimumValue ?? 0;
  const maximum = Math.max(minimum + 0.001, props.maximumValue ?? 1);
  const value = Math.min(maximum, Math.max(minimum, props.value ?? minimum));
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);
  const draftRef = useRef(value);
  const displayValue = dragging ? draft : value;
  const fill = ((displayValue - minimum) / (maximum - minimum)) * 100;
  const sliding = useRef(false);
  const start = () => {
    if (!sliding.current) {
      sliding.current = true;
      draftRef.current = value;
      setDraft(value);
      setDragging(true);
      props.onSlidingStart?.(value);
    }
  };
  const end = () => {
    if (sliding.current) {
      sliding.current = false;
      setDragging(false);
      props.onSlidingComplete?.(draftRef.current);
    }
  };
  return (
    <View style={[{ minHeight: 32, justifyContent: "center" }, props.style]}>
      <style>{`.dashy-range{appearance:none;-webkit-appearance:none;width:100%;height:28px;margin:0;background:transparent;cursor:pointer;touch-action:none}.dashy-range:disabled{opacity:.35;cursor:default}.dashy-range:focus-visible{outline:2px solid #42e2f4;outline-offset:4px;border-radius:12px}.dashy-range::-webkit-slider-runnable-track{height:4px;border-radius:8px;background:var(--dashy-track)}.dashy-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:var(--dashy-thumb);margin-top:-5.5px;box-shadow:0 0 14px #42e2f433}.dashy-range::-moz-range-track{height:4px;border-radius:8px;background:var(--dashy-track)}.dashy-range::-moz-range-thumb{width:15px;height:15px;border:0;border-radius:50%;background:var(--dashy-thumb)}`}</style>
      <input
        type="range"
        className="dashy-range"
        aria-label={props.accessibilityLabel}
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={displayValue}
        disabled={props.disabled}
        min={minimum}
        max={maximum}
        step={props.step && props.step > 0 ? props.step : "any"}
        value={displayValue}
        style={
          {
            "--dashy-track": `linear-gradient(to right, ${props.minimumTrackTintColor ?? "#42e2f4"} ${fill}%, ${props.maximumTrackTintColor ?? "rgba(255,255,255,.14)"} ${fill}%)`,
            "--dashy-thumb": props.thumbTintColor ?? "#fafafd",
          } as React.CSSProperties
        }
        onPointerDown={(event) => {
          start();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            start();
        }}
        onKeyUp={end}
        onBlur={end}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          draftRef.current = next;
          setDraft(next);
          props.onValueChange?.(next);
          if (!sliding.current) props.onSlidingComplete?.(next);
        }}
      />
    </View>
  );
}
