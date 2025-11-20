/* @vitest-environment jsdom */
/**
 * @fileoverview Form機能（getValues, setValues, addErrorMessage）のテスト
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';

describe('Form', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('getValues', () => {
    it('should get simple values', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="田中太郎">
          <input type="number" name="age" value="25">
          <input type="email" name="email" value="tanaka@example.com">
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.name).toBe('田中太郎');
      expect(values.age).toBe('25');
      expect(values.email).toBe('tanaka@example.com');
    });

    it('should get nested object values with data-form-object', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="田中太郎">
          <div data-form-object="address">
            <input type="text" name="city" value="東京">
            <input type="text" name="street" value="渋谷区1-1-1">
            <input type="text" name="zip" value="150-0001">
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.name).toBe('田中太郎');
      expect(values.address).toEqual({
        city: '東京',
        street: '渋谷区1-1-1',
        zip: '150-0001',
      });
    });

    it('should get deeply nested object values', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="会社A">
          <div data-form-object="location">
            <input type="text" name="country" value="日本">
            <div data-form-object="address">
              <input type="text" name="city" value="東京">
              <input type="text" name="district" value="渋谷区">
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.name).toBe('会社A');
      expect(values.location).toEqual({
        country: '日本',
        address: {
          city: '東京',
          district: '渋谷区',
        },
      });
    });

    it('should get array values with data-form-list on container', async () => {
      // data-form-listは入力要素ではなくコンテナ要素に付ける
      // 入力要素に直接付けた場合は配列にならない（最後の値のみ取得される）
      container.innerHTML = `
        <form>
          <div data-form-list="tags">
            <div><input type="text" name="value" value="タグ1"></div>
            <div><input type="text" name="value" value="タグ2"></div>
            <div><input type="text" name="value" value="タグ3"></div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.tags).toEqual([
        {value: 'タグ1'},
        {value: 'タグ2'},
        {value: 'タグ3'},
      ]);
    });

    it('should get object array values with data-form-list on container', async () => {
      container.innerHTML = `
        <form>
          <div data-form-list="items">
            <div>
              <input type="text" name="name" value="商品A">
              <input type="number" name="price" value="100">
            </div>
            <div>
              <input type="text" name="name" value="商品B">
              <input type="number" name="price" value="200">
            </div>
            <div>
              <input type="text" name="name" value="商品C">
              <input type="number" name="price" value="300">
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.items).toEqual([
        {name: '商品A', price: '100'},
        {name: '商品B', price: '200'},
        {name: '商品C', price: '300'},
      ]);
    });

    it('should get nested array with objects', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="orderName" value="注文1">
          <div data-form-list="products">
            <div>
              <input type="text" name="productName" value="商品X">
              <input type="number" name="quantity" value="2">
              <div data-form-object="details">
                <input type="text" name="color" value="赤">
                <input type="text" name="size" value="M">
              </div>
            </div>
            <div>
              <input type="text" name="productName" value="商品Y">
              <input type="number" name="quantity" value="1">
              <div data-form-object="details">
                <input type="text" name="color" value="青">
                <input type="text" name="size" value="L">
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.orderName).toBe('注文1');
      expect(values.products).toEqual([
        {
          productName: '商品X',
          quantity: '2',
          details: {color: '赤', size: 'M'},
        },
        {
          productName: '商品Y',
          quantity: '1',
          details: {color: '青', size: 'L'},
        },
      ]);
    });

    it('should get complex nested structure with multiple arrays', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="companyName" value="会社X">
          <div data-form-list="departments">
            <div>
              <input type="text" name="deptName" value="営業部">
              <div data-form-list="employees">
                <div>
                  <input type="text" name="empName" value="田中">
                  <input type="text" name="role" value="部長">
                </div>
                <div>
                  <input type="text" name="empName" value="佐藤">
                  <input type="text" name="role" value="課長">
                </div>
              </div>
            </div>
            <div>
              <input type="text" name="deptName" value="開発部">
              <div data-form-list="employees">
                <div>
                  <input type="text" name="empName" value="鈴木">
                  <input type="text" name="role" value="リーダー">
                </div>
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;
      const values = Form.getValues(fragment);

      expect(values.companyName).toBe('会社X');
      expect(values.departments).toEqual([
        {
          deptName: '営業部',
          employees: [
            {empName: '田中', role: '部長'},
            {empName: '佐藤', role: '課長'},
          ],
        },
        {
          deptName: '開発部',
          employees: [{empName: '鈴木', role: 'リーダー'}],
        },
      ]);
    });
  });

  describe('setValues', () => {
    it('should set simple values', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="">
          <input type="number" name="age" value="">
          <input type="email" name="email" value="">
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.setValues(fragment, {
        name: '山田花子',
        age: 30,
        email: 'yamada@example.com',
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const nameInput = container.querySelector(
        'input[name="name"]',
      ) as HTMLInputElement;
      const ageInput = container.querySelector(
        'input[name="age"]',
      ) as HTMLInputElement;
      const emailInput = container.querySelector(
        'input[name="email"]',
      ) as HTMLInputElement;

      expect(nameInput.value).toBe('山田花子');
      expect(ageInput.value).toBe('30');
      expect(emailInput.value).toBe('yamada@example.com');
    });

    it('should set nested object values', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="">
          <div data-form-object="address">
            <input type="text" name="city" value="">
            <input type="text" name="street" value="">
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.setValues(fragment, {
        name: '鈴木一郎',
        address: {
          city: '大阪',
          street: '北区2-2-2',
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const nameInput = container.querySelector(
        'input[name="name"]',
      ) as HTMLInputElement;
      const cityInput = container.querySelector(
        'input[name="city"]',
      ) as HTMLInputElement;
      const streetInput = container.querySelector(
        'input[name="street"]',
      ) as HTMLInputElement;

      expect(nameInput.value).toBe('鈴木一郎');
      expect(cityInput.value).toBe('大阪');
      expect(streetInput.value).toBe('北区2-2-2');
    });

    it('should set deeply nested object values', async () => {
      container.innerHTML = `
        <form>
          <div data-form-object="company">
            <input type="text" name="name" value="">
            <div data-form-object="location">
              <input type="text" name="country" value="">
              <div data-form-object="address">
                <input type="text" name="city" value="">
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.setValues(fragment, {
        company: {
          name: '株式会社テスト',
          location: {
            country: '日本',
            address: {
              city: '福岡',
            },
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const nameInput = container.querySelector(
        'input[name="name"]',
      ) as HTMLInputElement;
      const countryInput = container.querySelector(
        'input[name="country"]',
      ) as HTMLInputElement;
      const cityInput = container.querySelector(
        'input[name="city"]',
      ) as HTMLInputElement;

      expect(nameInput.value).toBe('株式会社テスト');
      expect(countryInput.value).toBe('日本');
      expect(cityInput.value).toBe('福岡');
    });

    it('should set object array values', async () => {
      container.innerHTML = `
        <form>
          <div data-form-list="items">
            <div>
              <input type="text" name="name" value="">
              <input type="number" name="price" value="">
            </div>
            <div>
              <input type="text" name="name" value="">
              <input type="number" name="price" value="">
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.setValues(fragment, {
        items: [
          {name: '新商品A', price: 500},
          {name: '新商品B', price: 600},
        ],
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const nameInputs = container.querySelectorAll('input[name="name"]');
      const priceInputs = container.querySelectorAll('input[name="price"]');

      expect((nameInputs[0] as HTMLInputElement).value).toBe('新商品A');
      expect((priceInputs[0] as HTMLInputElement).value).toBe('500');
      expect((nameInputs[1] as HTMLInputElement).value).toBe('新商品B');
      expect((priceInputs[1] as HTMLInputElement).value).toBe('600');
    });

    it('should set nested array with objects', async () => {
      container.innerHTML = `
        <form>
          <div data-form-list="orders">
            <div>
              <input type="text" name="orderId" value="">
              <div data-form-object="customer">
                <input type="text" name="name" value="">
                <input type="text" name="phone" value="">
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.setValues(fragment, {
        orders: [
          {
            orderId: 'ORD-001',
            customer: {
              name: '高橋',
              phone: '090-1234-5678',
            },
          },
        ],
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const orderIdInput = container.querySelector(
        'input[name="orderId"]',
      ) as HTMLInputElement;
      const nameInput = container.querySelector(
        'input[name="name"]',
      ) as HTMLInputElement;
      const phoneInput = container.querySelector(
        'input[name="phone"]',
      ) as HTMLInputElement;

      expect(orderIdInput.value).toBe('ORD-001');
      expect(nameInput.value).toBe('高橋');
      expect(phoneInput.value).toBe('090-1234-5678');
    });
  });

  describe('addErrorMessage', () => {
    it('should add error message to simple input', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="">
          <input type="email" name="email" value="">
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.addErrorMessage(fragment, 'name', '名前は必須です');
      await new Promise(resolve => setTimeout(resolve, 50));

      const nameInput = container.querySelector('input[name="name"]')!;
      const parentElement = nameInput.parentElement!;
      expect(parentElement.getAttribute('data-message')).toBe('名前は必須です');
    });

    it('should add error message to nested object field', async () => {
      container.innerHTML = `
        <form>
          <div data-form-object="address">
            <input type="text" name="city" value="">
            <input type="text" name="street" value="">
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.addErrorMessage(
        fragment,
        'address.city',
        '市区町村は必須です',
      );
      await new Promise(resolve => setTimeout(resolve, 50));

      const cityInput = container.querySelector('input[name="city"]')!;
      const parentElement = cityInput.parentElement!;
      expect(parentElement.getAttribute('data-message')).toBe(
        '市区町村は必須です',
      );
    });

    it('should add error message to deeply nested field', async () => {
      container.innerHTML = `
        <form>
          <div data-form-object="company">
            <div data-form-object="location">
              <input type="text" name="country" value="">
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.addErrorMessage(
        fragment,
        'company.location.country',
        '国名は必須です',
      );
      await new Promise(resolve => setTimeout(resolve, 50));

      const countryInput = container.querySelector('input[name="country"]')!;
      const parentElement = countryInput.parentElement!;
      expect(parentElement.getAttribute('data-message')).toBe('国名は必須です');
    });

    it('should add error message to array item field', async () => {
      container.innerHTML = `
        <form>
          <div data-form-list="items">
            <div data-row="0">
              <input type="text" name="name" value="">
            </div>
            <div data-row="1">
              <input type="text" name="name" value="">
            </div>
            <div data-row="2">
              <input type="text" name="name" value="">
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      // 2番目の配列要素にエラーを追加
      await Form.addErrorMessage(
        fragment,
        'items[1].name',
        '2番目の項目名は必須です',
      );
      await new Promise(resolve => setTimeout(resolve, 50));

      const rows = container.querySelectorAll('[data-row]');
      const secondRowInput = rows[1].querySelector('input[name="name"]')!;
      const parentElement = secondRowInput.parentElement!;
      expect(parentElement.getAttribute('data-message')).toBe(
        '2番目の項目名は必須です',
      );
    });

    it('should add error message to nested field in array item', async () => {
      container.innerHTML = `
        <form>
          <div data-form-list="orders">
            <div data-row="0">
              <div data-form-object="customer">
                <input type="text" name="name" value="">
              </div>
            </div>
            <div data-row="1">
              <div data-form-object="customer">
                <input type="text" name="name" value="">
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.addErrorMessage(
        fragment,
        'orders[1].customer.name',
        '顧客名は必須です',
      );
      await new Promise(resolve => setTimeout(resolve, 50));

      const rows = container.querySelectorAll('[data-row]');
      const secondRowInput = rows[1].querySelector('input[name="name"]')!;
      const parentElement = secondRowInput.parentElement!;
      expect(parentElement.getAttribute('data-message')).toBe(
        '顧客名は必須です',
      );
    });

    it('should add error message to form when key not found', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="">
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      await Form.addErrorMessage(
        fragment,
        'nonexistent',
        'フォーム全体のエラー',
      );
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(form.getAttribute('data-message')).toBe('フォーム全体のエラー');
    });

    it('should clear messages with Form.clearMessages', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="name" value="">
          <div data-form-object="address">
            <input type="text" name="city" value="">
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      // エラーメッセージを追加
      await Form.addErrorMessage(fragment, 'name', 'エラー1');
      await Form.addErrorMessage(fragment, 'address.city', 'エラー2');
      await new Promise(resolve => setTimeout(resolve, 50));

      // メッセージをクリア
      await Form.clearMessages(fragment);
      await new Promise(resolve => setTimeout(resolve, 50));

      const messagesAfter = container.querySelectorAll('[data-message]');
      expect(messagesAfter.length).toBe(0);
    });
  });

  describe('getValues and setValues roundtrip', () => {
    it('should maintain data integrity with complex nested structure', async () => {
      container.innerHTML = `
        <form>
          <input type="text" name="title" value="">
          <div data-form-object="metadata">
            <input type="text" name="author" value="">
            <input type="text" name="version" value="">
          </div>
          <div data-form-list="sections">
            <div>
              <input type="text" name="heading" value="">
              <div data-form-list="paragraphs">
                <div>
                  <input type="text" name="text" value="">
                </div>
                <div>
                  <input type="text" name="text" value="">
                </div>
              </div>
            </div>
            <div>
              <input type="text" name="heading" value="">
              <div data-form-list="paragraphs">
                <div>
                  <input type="text" name="text" value="">
                </div>
              </div>
            </div>
          </div>
        </form>
      `;

      await Core.scan(container);
      await new Promise(resolve => setTimeout(resolve, 50));

      const form = container.querySelector('form')!;
      const fragment = Fragment.get(form) as ElementFragment;

      const originalData = {
        title: 'ドキュメントタイトル',
        metadata: {
          author: '著者名',
          version: '0.1.0',
        },
        sections: [
          {
            heading: 'セクション1',
            paragraphs: [{text: '段落1-1'}, {text: '段落1-2'}],
          },
          {
            heading: 'セクション2',
            paragraphs: [{text: '段落2-1'}],
          },
        ],
      };

      await Form.setValues(fragment, originalData);
      await new Promise(resolve => setTimeout(resolve, 50));

      const retrievedData = Form.getValues(fragment);

      expect(retrievedData).toEqual(originalData);
    });
  });
});
