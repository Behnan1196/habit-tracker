export type ItemKind = 'daily' | 'persistent' | 'metric';
export type PlanStatus = 'planned' | 'done' | 'cancelled';

export interface PlannerGroup {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
}

export interface PlannerItem {
  id: string;
  groupId: string | null;
  kind: ItemKind;
  name: string;
  color: string | null;
  metricUnit: string | null;
  position: number;
}

export interface TimeSlot {
  id: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  color: string | null;
  position: number;
}
