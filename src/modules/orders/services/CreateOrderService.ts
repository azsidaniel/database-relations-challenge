import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const foundCustomer = await this.customersRepository.findById(customer_id);

    if (!foundCustomer) {
      throw new AppError('Could not find any customer with the given id');
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (!foundProducts.length) {
      throw new AppError('Could not find any products with the given id');
    }

    const foundProductsIds = foundProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !foundProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      const inexistentProductsIds = checkInexistentProducts.map(
        inexistentProduct => inexistentProduct.id,
      );
      if (inexistentProductsIds.length === 1) {
        throw new AppError(
          `Could not find product ${inexistentProductsIds[0]}`,
        );
      }
      throw new AppError(`Could not find products ${inexistentProductsIds}`);
    }

    const foundProductsWithNoQuantityAvaiable = products.filter(product => {
      const foundProduct = foundProducts.find(p => p.id === product.id);
      if (!foundProduct) {
        throw new AppError(`Could not find product`);
      }

      return foundProduct.quantity < product.quantity;
    });

    if (foundProductsWithNoQuantityAvaiable.length) {
      throw new AppError(
        `The quantity ${foundProductsWithNoQuantityAvaiable[0].quantity} is not avaiable for ${foundProductsWithNoQuantityAvaiable[0].id}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: foundProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: foundCustomer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        foundProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
