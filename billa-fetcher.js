"use strict";

const request = require("request");
const util = require("util");
const rp = require('request-promise');
const deferred = require("deferred");

var Promise = require("bluebird");
var Product = require("./product-class");

function fetchData() {
  console.log("fetch billa data");

  var categoriesUrl = "https://shop.billa.at/api/navigation";
  var productsUrl = "https://shop.billa.at/api/search/full?category=B2&pageSize=9175&isFirstPage=true&isLastPage=true";

  var categoriesPromise = fetchDataFromUrl(categoriesUrl);
  var productPromise = fetchDataFromUrl(productsUrl);

  return Promise.all([categoriesPromise, productPromise]).then(([categories, products]) => {
    console.log("preprocess billa data");
    return preprocessData(categories, products);
  }).catch((e) => {
    console.error(e);
  });
}

function preprocessData(categoriesData, productsData) {
  let categories = preprocessCategories(categoriesData);
  let products = preprocessProducts(productsData);

  let categoriesList = [];
  for (var category in categories) {
    categoriesList.push(categories[category]);
  }

  let data = {
    categories: categoriesList,
    products: products
  };

  return data;
}

function preprocessProducts(productsData) {
  let products = [];
  let tiles = productsData.tiles;

  for (let i = 0; i < tiles.length; i++) {
    let tile = tiles[i];
    let product = preprocessProduct(tile);

    products.push(product);
  }

  debugger;

  return products;
}

function preprocessProduct(tile) {
  let data = tile.data;
  let product = new Product();

  product.shopKey = null;
  product.id = data.articleId;
  product.title = data.name;
  product.slug = data.slug;
  product.imageUrl = getImageUrl(tile);
  product.brand = data.brand;
  product.categoryIds = data.articleGroupIds;
  product.amount = {
    weight: null,
    units: null
  };
  product.price = Math.floor(data.price.normal * 100);
  /*
  product.price = {
    original: data.price.normal * 100, // TODO write global method for this case
    pricePerUnit: data.unit // TODO implement own calculation
  };
	*/
  product.sale = Math.floor(data.price.sale * 100);
  /*
  product.sale = {
    original: data.price.sale * 100, // TODO write global method for this case
    pricePerUnit: data.unit // TODO implement own calculation
  };
  */
  product.discount = getProductDiscount(data);
  product.available = true;
  product.description.push(data.description);
  product.tags = getProductTags(data);
  product.similarProducts = [];
  product.details.recommendedProductIds = data.recommendationArticleIds;

  return product;
}

function getProductDiscount(data) {
  let defaultPriceTypes = data.price.defaultPriceTypes;
  let bulkDiscountPriceTypes = data.price.bulkDiscountPriceTypes;

  if (!defaultPriceTypes.length && !bulkDiscountPriceTypes.length) {
    return null;
  }

  if (!defaultPriceTypes.length) {
    defaultPriceTypes.push("AKTION");
  }

  let discount = {
    types: defaultPriceTypes,
    conditions: bulkDiscountPriceTypes,
    additionalInfo: data.price.priceAdditionalInfo.vptxt
  };

  return discount;
}

function getImageUrl(data) {
  let productId = data.articleId;
  return `https://files.billa.at/files/artikel/${productId}_01__600x600.jpg`;
}

function getProductTags(data) {
  const translator = {
    "s_bio": "organic",
    "s_marke": "brand",
    "s_gekuehlt": "cooled",
    "s_tiefgek": "frozen",
    "s_guetesie": "seal of quality",
    "s_spezern": "special diet",
    "s_herkunft": "country of origin",
    "s_hkland": "country of origin",
    "s_regio": "regional",
    "s_new": "new",
    "mengemin": "varying weight",
  };

  var attributes = data.attributes;
  var priceTypes = data.vtcPrice.defaultPriceTypes;
  var generalTags = [];
  var shopTags = [];

  if (attributes) {
    for (let i = 0; i < attributes.length; i++) {
      let attribute = attributes[i];
      let tag = translator[attribute];

      if (tag) {
        generalTags.push(tag);
      } else {
        shopTags.push(attribute);
      }
    }
  }

  if (priceTypes) {
    for (let i = 0; i < priceTypes.length; i++) {
      let priceType = priceTypes[i];
      let tag = translator[priceType];

      if (tag) {
        generalTags.push(tag);
      } else {
        shopTags.push(priceType);
      }
    }
  }

  if (data.vtcOnly) {
    generalTags.push("online-shop only");
  }

  let tagsData = {
    generalTags: generalTags,
    shopTags: shopTags
  }

  return tagsData;
}

function preprocessCategories(categoryData) {
  var categories = {};

  for (let i = 0; i < categoryData.length; i++) {
    let category = categoryData[i];
    let categoryId = category.articleGroupId;
    let subcategoryData = category.children;

    categories[categoryId] = {
      identifier: categoryId,
      title: category.title,
      slug: getSegmentFromUrl(category.url, 1),
      subcategoryIdentifiers: []
    }

    for (let j = 0; j < subcategoryData.length; j++) {
      let subcategory = subcategoryData[j];
      let subcategoryId = subcategory.articleGroupId;
      let subsubcategoryData = subcategory.children;

      categories[subcategoryId] = {
        identifier: subcategoryId,
        title: subcategory.title,
        slug: getSegmentFromUrl(subcategory.url, 2),
        subcategoryIdentifiers: []
      }

      categories[categoryId].subcategoryIdentifiers.push(subcategoryId);

      for (let k = 0; k < subsubcategoryData.length; k++) {
        let subsubcategory = subsubcategoryData[k];
        let subsubcategoryId = subsubcategory.articleGroupId;

        categories[subsubcategoryId] = {
          identifier: subsubcategoryId,
          title: subsubcategory.title,
          slug: getSegmentFromUrl(subsubcategory.url, 3),
          subcategoryIdentifiers: []
        }

        categories[subcategoryId].subcategoryIdentifiers.push(subsubcategoryId);
      }
    }
  }

  return categories;
}

function getSegmentFromUrl(string, segment) {
  return string.split("/")[segment];
}

function fetchDataFromUrl(url) {
  var future = deferred();

  let options = {
    url: url,
    json: true
  };

  let promise = request(options, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      console.log("raw billa data fetched from " + url);
      future.resolve(body);
    } else {
      console.error("billa raw data error: " + error);
      future.reject(error);
    }
  });

  return future.promise;
}

module.exports = {
  fetchData: fetchData
}
