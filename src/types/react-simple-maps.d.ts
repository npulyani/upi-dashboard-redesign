declare module "react-simple-maps" {
  import { ComponentType, MouseEventHandler, SVGProps } from "react";

  interface ProjectionConfig {
    center?: [number, number];
    scale?: number;
    rotate?: [number, number, number];
  }

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: GeoFeature[] }) => React.ReactNode;
  }

  interface GeoFeature {
    rsmKey: string;
    properties: Record<string, string | null>;
    [key: string]: unknown;
  }

  interface GeographyProps {
    geography: GeoFeature;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: { default?: React.CSSProperties; hover?: React.CSSProperties; pressed?: React.CSSProperties };
    onMouseEnter?: MouseEventHandler<SVGPathElement>;
    onMouseMove?: MouseEventHandler<SVGPathElement>;
    onMouseLeave?: MouseEventHandler<SVGPathElement>;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
}
