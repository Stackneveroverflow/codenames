export interface GeneratedImage {
  contentType: string;
  data: Buffer;
}

export class GeneratedImageStore {
  private readonly images = new Map<string, GeneratedImage>();

  put(url: string, image: GeneratedImage) {
    this.images.set(url, image);
  }

  get(url: string): GeneratedImage | undefined {
    return this.images.get(url);
  }

  getByRoute(roomId: string, dealId: string, cardId: string): GeneratedImage | undefined {
    return this.get(this.urlFor(roomId, dealId, cardId));
  }

  urlFor(roomId: string, dealId: string, cardId: string) {
    return `/generated-cards/${encodeURIComponent(roomId)}/${encodeURIComponent(dealId)}/${encodeURIComponent(cardId)}.png`;
  }
}
