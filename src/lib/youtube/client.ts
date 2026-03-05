
import { Innertube, UniversalCache } from 'youtubei.js';

let innertube: Innertube | null = null;

export async function getInnertube(): Promise<Innertube> {
    if (!innertube) {
        innertube = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true,
            device_category: 'desktop',
            client_type: 'WEB' as any, // Confirmed working for metadata
        });
    }
    return innertube;
}
