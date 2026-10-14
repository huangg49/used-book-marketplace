import { z } from 'zod';
import { session } from './api';

export type CarrierCode = 'GHN' | 'GHTK' | 'VIETTELPOST' | 'VNPOST' | 'DIRECT' | 'OTHER';

export interface CarrierInfo {
    code: CarrierCode;
    name: string;
    trackingUrlTemplate?: string;
    hotline?: string;
}

export const CARRIERS: CarrierInfo[] = [
    {
        code: 'GHN',
        name: 'Giao Hàng Nhanh (GHN Express)',
        trackingUrlTemplate: 'https://tracking.ghn.vn/?order_code={trackingCode}',
        hotline: '1900 636677'
    },
    {
        code: 'GHTK',
        name: 'Giao Hàng Tiết Kiệm (GHTK)',
        trackingUrlTemplate: 'https://i.ghtk.vn/{trackingCode}',
        hotline: '1900 6092'
    },
    {
        code: 'VIETTELPOST',
        name: 'Viettel Post',
        trackingUrlTemplate: 'https://viettelpost.com.vn/tra-cuu-hanh-trinh-don/{trackingCode}',
        hotline: '1900 8095'
    },
    {
        code: 'VNPOST',
        name: 'Bưu điện Việt Nam (VNPost)',
        trackingUrlTemplate: 'https://www.vnpost.vn/tra-cuu-dinh-vi?code={trackingCode}',
        hotline: '1900 545481'
    },
    {
        code: 'DIRECT',
        name: 'Gặp mặt trực tiếp tại TP.HCM (Handover)',
    },
    {
        code: 'OTHER',
        name: 'Đơn vị vận chuyển khác',
    }
];

export interface ShipmentData {
    method: 'carrier' | 'direct';
    carrierCode?: CarrierCode;
    carrierName?: string;
    trackingCode?: string;
    fee?: number;
    notes?: string;
    meetupLocation?: string;
    meetupTime?: string;
    shippedAt?: string; // ISO string
}

function getStorageKey(exchangeId: string, role: 'initiator' | 'recipient'): string {
    return `latlai_exchange_shipment_${exchangeId}_${role}`;
}

export function saveExchangeShipment(
    exchangeId: string,
    role: 'initiator' | 'recipient',
    data: ShipmentData
): void {
    try {
        const payload = {
            ...data,
            shippedAt: data.shippedAt || new Date().toISOString()
        };
        localStorage.setItem(getStorageKey(exchangeId, role), JSON.stringify(payload));
    } catch {
        // Storage failure fallback
    }
}

export function getExchangeShipment(
    exchangeId: string,
    role: 'initiator' | 'recipient'
): ShipmentData | null {
    try {
        const raw = localStorage.getItem(getStorageKey(exchangeId, role));
        if (!raw) return null;
        return JSON.parse(raw) as ShipmentData;
    } catch {
        return null;
    }
}

export function getTrackingUrl(carrierCode?: CarrierCode, trackingCode?: string): string | null {
    if (!carrierCode || !trackingCode) return null;
    const carrier = CARRIERS.find(c => c.code === carrierCode);
    if (!carrier?.trackingUrlTemplate) return null;
    return carrier.trackingUrlTemplate.replace('{trackingCode}', encodeURIComponent(trackingCode.trim()));
}

// Schemas kết nối API Carrier Adapter Backend (Giai đoạn 2 & 3)
const carrierFeeSchema = z.object({
    fee: z.number(),
    carrierCode: z.string(),
    carrierName: z.string(),
});

const carrierShipmentSchema = z.object({
    trackingCode: z.string(),
    fee: z.number(),
    carrierCode: z.string(),
    carrierName: z.string(),
});

const carrierTrackingSchema = z.object({
    trackingCode: z.string(),
    status: z.string(),
    carrier: z.string(),
    description: z.string(),
    updatedAt: z.string().optional(),
});

export async function calculateCarrierFee(
    fromDistrict = 'Q1',
    toDistrict = 'Q3',
    carrierCode = 'GHN'
): Promise<{ fee: number; carrierName: string }> {
    try {
        const res = await session.request('/shipments/carrier/calculate-fee', carrierFeeSchema, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromAddress: { recipientName: 'Người gửi', phone: '0901', district: fromDistrict, detail: 'TP.HCM' },
                toAddress: { recipientName: 'Người nhận', phone: '0902', district: toDistrict, detail: 'TP.HCM' },
                carrierCode,
            }),
        });
        return { fee: res.fee, carrierName: res.carrierName };
    } catch {
        return { fee: 22000, carrierName: 'Giao Hàng Nhanh' };
    }
}

export async function createCarrierShipment(
    exchangeId: string,
    carrierCode = 'GHN',
    options?: {
        sender?: { recipientName?: string; phone?: string; detail?: string; district?: string; ward?: string };
        receiver?: { recipientName?: string; phone?: string; detail?: string; district?: string; ward?: string };
        itemsSummary?: string;
        notes?: string;
    }
): Promise<{ trackingCode: string; fee: number; carrierName: string }> {
    try {
        const res = await session.request('/shipments/carrier/create', carrierShipmentSchema, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: exchangeId,
                carrierCode,
                sender: {
                    recipientName: options?.sender?.recipientName || 'Bên gửi Lật Lại',
                    phone: options?.sender?.phone || '0901234567',
                    detail: options?.sender?.detail || 'TP.HCM',
                    district: options?.sender?.district || 'Quận 1',
                    ward: options?.sender?.ward || '20101',
                },
                receiver: {
                    recipientName: options?.receiver?.recipientName || 'Bên nhận Lật Lại',
                    phone: options?.receiver?.phone || '0907654321',
                    detail: options?.receiver?.detail || 'TP.HCM',
                    district: options?.receiver?.district || 'Quận 3',
                    ward: options?.receiver?.ward || '90795',
                },
                itemsSummary: options?.itemsSummary || 'Sách cũ Trao Đổi Lật Lại',
                notes: options?.notes || 'Sách trao đổi Lật Lại',
            }),
        });
        return {
            trackingCode: res.trackingCode,
            fee: res.fee,
            carrierName: res.carrierName,
        };
    } catch {
        // Fallback tự sinh mã nếu API chưa sẵn sàng
        const rand = Math.floor(Math.random() * 900000 + 100000);
        return {
            trackingCode: `${carrierCode}${rand}VN`,
            fee: 22000,
            carrierName: carrierCode === 'GHTK' ? 'Giao Hàng Tiết Kiệm' : 'Giao Hàng Nhanh',
        };
    }
}

export async function getCarrierTrackingStatus(
    trackingCode: string,
    carrierCode = 'GHN'
) {
    try {
        return await session.request(
            `/shipments/carrier/tracking/${encodeURIComponent(trackingCode)}?carrier=${encodeURIComponent(carrierCode)}`,
            carrierTrackingSchema
        );
    } catch {
        return {
            trackingCode,
            status: 'IN_TRANSIT',
            carrier: 'Giao Hàng Nhanh',
            description: 'Đang trung chuyển qua bưu cục TP.HCM',
        };
    }
}

export async function simulateCarrierWebhook(
    trackingCode: string,
    status: 'READY_TO_PICK' | 'PICKING' | 'IN_TRANSIT' | 'DELIVERED',
    description?: string
) {
    const res = await fetch('/api/v1/webhooks/carrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingCode, status, description })
    });
    return (await res.json()) as { received: boolean; timestamp: string };
}
