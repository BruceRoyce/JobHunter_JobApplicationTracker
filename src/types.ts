export const STATUSES = [
  "Applied",
  "Interested",
  "Going to interview",
  "unsuccessful",
  "successful",
  "Closed",
] as const;
export type Status = (typeof STATUSES)[number];
export type Via = "Employer" | "Agency";
export type ContractType = "Contract" | "Permanent";
export type SortKey = "updated" | "title" | "name" | "salary";
export type SortDir = "asc" | "desc";

export interface StoredFile {
  name: string;
  path: string;
}

export interface StatusEvent {
  id: number;
  status: Status;
  event_date: string;
  created_at: string;
}

export interface Job {
  id: number;
  is_starred: boolean;
  job_title: string;
  via: Via;
  employer_name: string | null;
  agency_name: string | null;
  contract_type: ContractType | null;
  salary_offer: string | null;
  contact_person: string | null;
  url: string | null;
  status: Status;
  record_date: string;
  folder: string;
  cv: StoredFile | null;
  cv_name: string | null;
  cover_letter: StoredFile | null;
  cover_name: string | null;
  advert: { path: string; content_type: string; source_url: string; frozen_at: string } | null;
  advert_error: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  events: StatusEvent[];
}

export interface JobList {
  items: Job[];
  total: number;
  page: number;
  pages: number;
  page_size: number;
  sort: SortKey;
  dir: SortDir;
}

export interface SaveResult {
  job: Job;
  warnings: string[];
}
