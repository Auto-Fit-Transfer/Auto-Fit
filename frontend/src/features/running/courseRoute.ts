import type { RunningCoordinate, RunningCourse } from '@/src/api/running';

export function validCoordinate(value: unknown): value is RunningCoordinate {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<RunningCoordinate>;
  return typeof point.latitude === 'number' && Number.isFinite(point.latitude)
    && point.latitude >= -90 && point.latitude <= 90
    && typeof point.longitude === 'number' && Number.isFinite(point.longitude)
    && point.longitude >= -180 && point.longitude <= 180;
}

export function routePoints(course: RunningCourse): RunningCoordinate[] {
  if (!Array.isArray(course.path)) return [];
  return course.path.filter(validCoordinate);
}

export function canPreviewRoute(course: RunningCourse) {
  return validCoordinate(course.start) && validCoordinate(course.end)
    && (!course.waypoints || course.waypoints.every(validCoordinate));
}

export function routePolyline(
  points: RunningCoordinate[], width = 320, height = 180,
  boundsPoints: RunningCoordinate[] = points,
): string {
  if (points.length < 2) return '';
  const averageLatitude = boundsPoints.reduce((sum, point) => sum + point.latitude, 0) / boundsPoints.length;
  const longitudeScale = Math.max(0.01, Math.cos(averageLatitude * Math.PI / 180));
  const xs = boundsPoints.map((point) => point.longitude * longitudeScale);
  const ys = boundsPoints.map((point) => point.latitude);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 0.000001);
  const rangeY = Math.max(maxY - minY, 0.000001);
  const scale = Math.min((width - 36) / rangeX, (height - 36) / rangeY);
  const xPad = (width - rangeX * scale) / 2;
  const yPad = (height - rangeY * scale) / 2;
  return points.map((point) =>
    `${(xPad + (point.longitude * longitudeScale - minX) * scale).toFixed(1)},${(height - yPad - (point.latitude - minY) * scale).toFixed(1)}`,
  ).join(' ');
}
