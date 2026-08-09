/**
 * Produtos mock realistas usados como fallback quando o wa-server não está disponível
 * (ambiente de preview / sandbox). Em produção com wa-server ativo, estes dados nunca aparecem.
 */

import type { AmazonProduct } from '@/app/api/amazon-deals/route';
import type { ShopeeProduct } from '@/app/api/shopee-deals/route';

export const MOCK_AMAZON: AmazonProduct[] = [
  {
    id: 'amz-B0BVTD1PN3', asin: 'B0BVTD1PN3',
    title: 'Fone de Ouvido Bluetooth JBL Tune 520BT Pure Bass sem Fio Over Ear Dobrável',
    price: 149.90, original_price: 279.90, discount_percent: 46,
    thumbnail: 'https://m.media-amazon.com/images/I/61yKj7BKVIL._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0BVTD1PN3',
    source: 'amazon', stars: 4.6, reviews: 4821, prime: true,
  },
  {
    id: 'amz-B09B8NNKG9', asin: 'B09B8NNKG9',
    title: 'Smartphone Samsung Galaxy A15 128GB 4GB RAM Dual SIM Tela 6.5" - Azul',
    price: 899.00, original_price: 1499.00, discount_percent: 40,
    thumbnail: 'https://m.media-amazon.com/images/I/71fzWD5OIFL._AC_SX342_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B09B8NNKG9',
    source: 'amazon', stars: 4.4, reviews: 2310, prime: true,
  },
  {
    id: 'amz-B0BX9VH4LC', asin: 'B0BX9VH4LC',
    title: 'Air Fryer Philips Walita Série 3000 4,1L Digital com Visor 1400W - Preta',
    price: 349.00, original_price: 599.00, discount_percent: 42,
    thumbnail: 'https://m.media-amazon.com/images/I/71Z4TbfMBcL._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0BX9VH4LC',
    source: 'amazon', stars: 4.7, reviews: 8934, prime: true,
  },
  {
    id: 'amz-B09QP1KRN1', asin: 'B09QP1KRN1',
    title: 'Smart TV Samsung 50" Crystal UHD 4K 2023 50CU8000 Processador Crystal HDR',
    price: 1599.00, original_price: 2799.00, discount_percent: 43,
    thumbnail: 'https://m.media-amazon.com/images/I/71HFv3+9K4L._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B09QP1KRN1',
    source: 'amazon', stars: 4.5, reviews: 3102, prime: true,
  },
  {
    id: 'amz-B0C7YQM3QJ', asin: 'B0C7YQM3QJ',
    title: 'Notebook Lenovo IdeaPad 1 Intel Core i5-1235U 8GB 256GB SSD 15.6" FHD',
    price: 2199.00, original_price: 3499.00, discount_percent: 37,
    thumbnail: 'https://m.media-amazon.com/images/I/71K9WPGJ2gL._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0C7YQM3QJ',
    source: 'amazon', stars: 4.3, reviews: 1245, prime: false,
  },
  {
    id: 'amz-B09RDKQ3QM', asin: 'B09RDKQ3QM',
    title: 'Smartwatch Amazfit GTS 4 Mini GPS Bateria 15 dias Resistente à Água 5ATM',
    price: 299.00, original_price: 499.00, discount_percent: 40,
    thumbnail: 'https://m.media-amazon.com/images/I/61y9WfbYwwL._AC_SX342_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B09RDKQ3QM',
    source: 'amazon', stars: 4.4, reviews: 2876, prime: true,
  },
  {
    id: 'amz-B0C5QNHPHR', asin: 'B0C5QNHPHR',
    title: 'Caixa de Som Bluetooth JBL Flip 6 20W RMS À Prova D\'água IPX7',
    price: 399.00, original_price: 699.00, discount_percent: 43,
    thumbnail: 'https://m.media-amazon.com/images/I/71ypTGhBwIL._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0C5QNHPHR',
    source: 'amazon', stars: 4.8, reviews: 6540, prime: true,
  },
  {
    id: 'amz-B08T9J5M6H', asin: 'B08T9J5M6H',
    title: 'Kindle 11ª Geração 16GB Iluminação Embutida Wi-Fi - Preto',
    price: 299.00, original_price: 499.00, discount_percent: 40,
    thumbnail: 'https://m.media-amazon.com/images/I/61FNIa4OQQL._AC_SX342_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B08T9J5M6H',
    source: 'amazon', stars: 4.7, reviews: 12300, prime: true,
  },
  {
    id: 'amz-B0C2Q5PCBD', asin: 'B0C2Q5PCBD',
    title: 'Aspirador de Pó Robô Xiaomi Robot Vacuum E10 2500Pa Navegação Inteligente',
    price: 699.00, original_price: 1299.00, discount_percent: 46,
    thumbnail: 'https://m.media-amazon.com/images/I/61bXIkBa9QL._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0C2Q5PCBD',
    source: 'amazon', stars: 4.3, reviews: 987, prime: false,
  },
  {
    id: 'amz-B0C8J2L9X1', asin: 'B0C8J2L9X1',
    title: 'Câmera IP Wi-Fi Inteligente Full HD 1080p Visão Noturna - Intelbras iM3',
    price: 129.00, original_price: 229.00, discount_percent: 44,
    thumbnail: 'https://m.media-amazon.com/images/I/61QSiwgxR+L._AC_SX522_.jpg',
    permalink: 'https://www.amazon.com.br/dp/B0C8J2L9X1',
    source: 'amazon', stars: 4.2, reviews: 3421, prime: true,
  },
];

export const MOCK_SHOPEE: ShopeeProduct[] = [
  {
    id: 'spee-11223344', title: 'Fone Bluetooth TWS 5.3 com Cancelamento de Ruído 40h Bateria - Preto',
    price: 49.90, original_price: 149.90, discount_percent: 67,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lrw7j9bxrfp4e5',
    permalink: 'https://shopee.com.br/Fone-Bluetooth-TWS-5.3-i.123456789.11223344',
    source: 'shopee', stars: 4.8, reviews: 12450, sold: 8920,
  },
  {
    id: 'spee-22334455', title: 'Smartwatch HW67 Pro Max Tela 2.0" NFC GPS Integrado - Preto',
    price: 79.90, original_price: 299.90, discount_percent: 73,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lrx2k9cybsp5f6',
    permalink: 'https://shopee.com.br/Smartwatch-HW67-i.987654321.22334455',
    source: 'shopee', stars: 4.5, reviews: 6732, sold: 4210,
  },
  {
    id: 'spee-33445566', title: 'Câmera de Segurança WiFi 1080P Visão Noturna Colorida 360° - Exterior',
    price: 59.90, original_price: 189.90, discount_percent: 68,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-ls12m4dlxq7h89',
    permalink: 'https://shopee.com.br/Camera-Seguranca-i.111222333.33445566',
    source: 'shopee', stars: 4.6, reviews: 9821, sold: 7654,
  },
  {
    id: 'spee-44556677', title: 'Kit 10 Cabos USB-C 1m Carregamento Rápido 65W Reforçado Nylon Trançado',
    price: 29.90, original_price: 89.90, discount_percent: 67,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lt45n6emzr8i90',
    permalink: 'https://shopee.com.br/Kit-Cabos-USB-C-i.444555666.44556677',
    source: 'shopee', stars: 4.9, reviews: 34210, sold: 28900,
  },
  {
    id: 'spee-55667788', title: 'Air Fryer 12L Digital Touchscreen 1800W Sem Óleo - Preto/Inox',
    price: 189.90, original_price: 599.90, discount_percent: 68,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lu56o7fnas9j01',
    permalink: 'https://shopee.com.br/Air-Fryer-12L-i.222333444.55667788',
    source: 'shopee', stars: 4.7, reviews: 15600, sold: 12000,
  },
  {
    id: 'spee-66778899', title: 'Tênis Masculino Running Academia Confortável Antiderrapante Macio',
    price: 69.90, original_price: 199.90, discount_percent: 65,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lv67p8gobt0k12',
    permalink: 'https://shopee.com.br/Tenis-Running-i.333444555.66778899',
    source: 'shopee', stars: 4.6, reviews: 8930, sold: 7200,
  },
  {
    id: 'spee-77889900', title: 'Luminária LED Ring Light 10" 26cm com Tripé 2m e Suporte Celular',
    price: 89.90, original_price: 259.90, discount_percent: 65,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lw78q9hpcu1l23',
    permalink: 'https://shopee.com.br/Ring-Light-10-i.555666777.77889900',
    source: 'shopee', stars: 4.7, reviews: 22100, sold: 18500,
  },
  {
    id: 'spee-88990011', title: 'Carregador Sem Fio 15W Qi MagSafe Compatível iPhone Samsung + Cabo USB-C',
    price: 39.90, original_price: 119.90, discount_percent: 67,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lx89r0iqdv2m34',
    permalink: 'https://shopee.com.br/Carregador-Sem-Fio-i.666777888.88990011',
    source: 'shopee', stars: 4.5, reviews: 5430, sold: 4100,
  },
  {
    id: 'spee-99001122', title: 'Mesa Gamer Com LED RGB Ajustável 120x60cm Suporte Monitor e Headset',
    price: 349.00, original_price: 999.00, discount_percent: 65,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-ly90s1jrew3n45',
    permalink: 'https://shopee.com.br/Mesa-Gamer-LED-i.777888999.99001122',
    source: 'shopee', stars: 4.4, reviews: 3210, sold: 2100,
  },
  {
    id: 'spee-00112233', title: 'Kit Skincare Vitamina C Clareadora Sérum + Protetor Solar FPS 50 + Hidratante',
    price: 49.90, original_price: 159.90, discount_percent: 69,
    thumbnail: 'https://cf.shopee.com.br/file/br-11134201-7r98o-lz01t2ksfx4o56',
    permalink: 'https://shopee.com.br/Kit-Skincare-Vitamina-C-i.888999000.00112233',
    source: 'shopee', stars: 4.8, reviews: 19870, sold: 16400,
  },
];
