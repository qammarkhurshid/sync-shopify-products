const Shopify = require('shopify-api-node');
const express = require('express');
const mongoose = require('mongoose');
const { default: axios } = require('axios');

const app = express();

// Shopify app credentials
const apiKey = '<shopify-api-key>';
const pass = '<shopify-access-token>';
const shopName = '<store-name>';

// MongoDB credentials
const mongoUrl = 'mongodb://localhost:27017/shopify-sync';

// Connect to MongoDB
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Shopify API client
const shopify = new Shopify({
  shopName,
  apiKey,
  apiVersion: '2023-01',
  password: pass,
  autoLimit: true,
});

// Mongoose model for synced products
const productSchema = new mongoose.Schema({
  storeId: String,
  productId: Number,
  title: String,
  bodyHtml: String,
  vendor: String,
  productType: String,
  createdAt: Date,
  updatedAt: Date,
  publishedAt: Date,
});
const Product = mongoose.model('Product', productSchema);

// Sync endpoint
app.post('/sync', async (req, res) => {
  try {
    // Retrieve last sync timestamp for the store from MongoDB
    const storeId = 1; // dummy
    const lastSynced = null; // dummy
    // await Product.findOne({ storeId }).sort('-updatedAt').exec();

    // Get active products from Shopify API
    let products = [];
    let sinceId = null;
    let result = { count: 0 };
    let count = await axios.get(`https://${shopName}.myshopify.com/admin/api/2023-01/products/count.json`, {
      headers: {
        'X-Shopify-Access-Token': pass,
      },
    });
    count = count.data.count;

    let params = {
      limit: 250,
      fields: ['id'],
    };

    do {
      if (lastSynced) {
        params.updated_at_min = lastSynced.updatedAt.toISOString();
      }
      if (sinceId) {
        params.since_id = sinceId;
      }
      result = await shopify.product.list(params);

      products = products.concat(result);
      params = result.nextPageParameters;
    } while (params !== undefined);

    // Store products in MongoDB
    for (const product of products) {
      const doc = {
        storeId,
        productId: product.id,
        title: product.title,
        bodyHtml: product.body_html,
        vendor: product.vendor,
        productType: product.product_type,
        createdAt: new Date(product.created_at),
        updatedAt: new Date(product.updated_at),
        publishedAt: product.published_at ? new Date(product.published_at) : null,
      };
      const productToInsert = new Product(doc);
      await productToInsert.save();
    }

    // Return success response
    res.json({ success: true, products: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const port = 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
