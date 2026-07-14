import { http } from './http';
import type { ReservationDateOverride, ReservationPeriod, ReservationPeriodRule, ReservationZone } from './types';

// Mirrors the response shape of GET /api/ReservationLinks/Booking?publicKey=...
// — the single call that loads everything a storefront needs to render for one store.

export interface BookingSettings {
  globalId?: number;
  siteId?: number;
  sNum?: number;
  logoUrl?: string | null;
  storeName?: string | null;
  phoneNumber?: string | null;
  color?: string | null;
  introduction?: string | null;
  colorNew?: string | null;
  colorConfirmed?: string | null;
  colorCancelled?: string | null;
  colorReserved?: string | null;
  colorOverdue?: string | null;
  colorSeated?: string | null;
  colorClosed?: string | null;
  colorNoShow?: string | null;
  emailAddress?: string | null;
  isSendGmail?: number;
  reminderTime?: number;
  isMultiMenu?: number;
  menuId?: number | null;
}

export interface BookingLinkInfo {
  siteId: number;
  sNum: number;
  statNum: number;
  channelId: number;
}

export interface BookingChannel {
  globalId?: number;
  channelID?: number;
  channelName: string;
  isLimitAvailable?: number;
  qtyLimit?: number;
  isPauseBooking?: number;
  isActive?: number;
}

export interface MenuProduct {
  id: number;
  prodNum?: number;
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number | null;
}

export interface MenuCategoryItem {
  id: number;
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number | null;
  products: MenuProduct[];
}

export interface BookingMenu {
  menuId: number;
  name?: string;
  description?: string | null;
  categories: MenuCategoryItem[];
}

export interface ReserMultiMenu {
  reserMultiMenuId: number;
  dayType?: number;
  dayOfWeek?: number | null;
  specialDate?: string | null;
  timeFrom?: string;
  timeTo?: string;
  crossDay?: number;
  menu: BookingMenu | null;
}

export interface ZoneSectionLink {
  zoneID: number;
  secNum: number;
  dateModified?: string;
}

export interface BookingSection {
  globalId: number;
  secnum: number;
  descript?: string | null;
  minCharge?: number | null;
  minCover?: number | null;
  ispool?: number;
  lockouttabs?: number;
  isactive?: number;
  postopx?: number | null;
  postopy?: number | null;
  hidepos?: number;
  pLink?: string | null;
  autoseat?: number;
  revCenter?: number;
  updateStatus?: number;
  snum?: number;
  hoRepGroups?: string | null;
  siteId?: number;
  dateModifier?: string;
}

export interface TableSetup {
  globalId: number;
  siteId?: number;
  tablenum: number;
  secnum: number;
  numcustomer?: number;
  updateStatus?: number;
  minnumcust?: number;
  maxnumcust?: number;
  canreserve?: number;
  pLink?: string | null;
  saleTypeIndex?: number;
  qLink?: string | null;
  descr?: string | null;
  snum?: number;
  hoRepGroups?: string | null;
  dateModifier?: string;
}

export interface EmailTemplate {
  [key: string]: unknown;
}

export interface MessageTemplate {
  [key: string]: unknown;
}

/** fieldType on ExtraFieldConfig: 0 = Text, 1 = Number, 2 = Date, 3 = Option (looked up here by fieldID). */
export const ExtraFieldType = {
  Text: 0,
  Number: 1,
  Date: 2,
  Option: 3,
} as const;

export interface ExtraFieldOption {
  fieldID: string | number;
  optionValue: string;
  optionText: string;
  displayOrder?: number;
}

export interface ExtraFieldConfig {
  globalId: number;
  fieldID: string;
  fieldName: string;
  fieldType: number;
  displayOrder: number;
  isRequired?: number;
  isVisible?: number;
  isActive?: number;
  defaultValue?: string;
}

export interface MainCarouselItem {
  globalId: number;
  carouselId: number;
  tag?: string;
  title?: string;
  subTitle?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive?: number;
}

export interface HighlightEventItem {
  globalId: number;
  highlightId: number;
  tag?: string;
  title?: string;
  subTitle?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive?: number;
}

export interface GoodToKnowItem {
  globalId: number;
  goodToKnowId: number;
  content: string;
  displayOrder: number;
  isActive?: number;
}

export interface HowItWorkItem {
  globalId: number;
  howitworkId: number;
  title: string;
  subTilte?: string;
  displayOrder: number;
  isActive?: number;
}

export interface StoreRecommendation {
  globalId: number;
  recommendStatNum: number;
  isActive?: number;
}

export interface BookingData {
  linkInfo: BookingLinkInfo;
  settings: BookingSettings;
  menu: BookingMenu | null;
  reserMultiMenus: ReserMultiMenu[];
  channel: BookingChannel;
  periods: ReservationPeriod[];
  periodRules: ReservationPeriodRule[];
  zones: ReservationZone[];
  zoneSectionLinks: ZoneSectionLink[];
  sections: BookingSection[];
  tableSetups: TableSetup[];
  dateOverrides: ReservationDateOverride[];
  emailTemplates: EmailTemplate[];
  messageTemplates: MessageTemplate[];
  extraFieldConfigs: ExtraFieldConfig[];
  extraFieldOptions: ExtraFieldOption[];
  mainCarousels: MainCarouselItem[];
  highlightEvents: HighlightEventItem[];
  goodToKnows: GoodToKnowItem[];
  howitworks: HowItWorkItem[];
  storeRecommendations: StoreRecommendation[];
}

interface ApiEnvelope<T> {
  status: number;
  statusText: string;
  message: string;
  data: T;
}

/** GET /api/ReservationLinks/Booking?publicKey=... — all storefront data for one store. */
export async function fetchBookingByPublicKey(publicKey: string): Promise<BookingData> {
  const { data } = await http.get<ApiEnvelope<BookingData>>('/api/ReservationLinks/Booking', {
    params: { publicKey },
  });
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to load store data');
  }
  return data.data;
}
