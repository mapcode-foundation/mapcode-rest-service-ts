// Copyright (C) 2026, Stichting Mapcode Foundation (http://www.mapcode.com)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Mirror speedtools Geo constants exactly (Geo.java).
const EARTH_RADIUS_X_METERS = 6378137.0;
const EARTH_RADIUS_Y_METERS = 6356752.3142;
const EARTH_CIRCUMFERENCE_X = EARTH_RADIUS_X_METERS * 2.0 * Math.PI;
const EARTH_CIRCUMFERENCE_Y = EARTH_RADIUS_Y_METERS * 2.0 * Math.PI;
const METERS_PER_DEGREE_LAT = EARTH_CIRCUMFERENCE_Y / 360.0;
const METERS_PER_DEGREE_LON_EQUATOR = EARTH_CIRCUMFERENCE_X / 360.0;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

/** Wrap a longitude in degrees into the range [-180, 180]. Mirrors speedtools Geo.mapToLon. */
export function mapToLon(lonDeg: number): number {
  let lon = lonDeg % 360;
  if (lon > 180) lon -= 360;
  else if (lon < -180) lon += 360;
  return lon;
}

/**
 * Distance in meters between two lat/lon points using the equirectangular (flat-earth)
 * approximation from speedtools Geo.distanceInMeters. Elevation is assumed 0.
 */
export function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const wrappedOnLongSide = lon1 > lon2;
  let deltaLonDegrees = wrappedOnLongSide ? 360.0 - (lon1 - lon2) : lon2 - lon1;
  if (deltaLonDegrees > 180.0) {
    deltaLonDegrees = 360.0 - deltaLonDegrees;
  }
  const deltaLatDegrees = Math.abs(lat1 - lat2);

  // Mid point of the two latitudes.
  const avgLat = lat1 + (lat2 - lat1) / 2.0;

  const deltaXMeters = deltaLonDegrees * METERS_PER_DEGREE_LON_EQUATOR * Math.cos(toRadians(avgLat));
  const deltaYMeters = deltaLatDegrees * METERS_PER_DEGREE_LAT;

  return Math.sqrt(deltaXMeters * deltaXMeters + deltaYMeters * deltaYMeters);
}
