import React, { useEffect, useState } from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

export const collectionArtwork = require("../../../assets/v2/collection-1.png");
export const secondArtwork = require("../../../assets/v2/collection-2.png");
export const thirdArtwork = require("../../../assets/v2/collection-3.png");
export function Artwork({
  uri,
  style,
  blurRadius = 0,
}: {
  uri?: string;
  style?: StyleProp<ImageStyle>;
  blurRadius?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <Image
      source={uri && !failed ? { uri } : collectionArtwork}
      style={style}
      blurRadius={blurRadius}
      onError={() => setFailed(true)}
    />
  );
}
