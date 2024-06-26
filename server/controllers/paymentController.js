const { sendTicket } = require("./smsController");
const express = require("express");
const app = express();
const User = require("../models/user");
const { Event } = require("../models/event");
const dotenv = require("dotenv");
dotenv.config();

const cookieParser = require("cookie-parser");
app.use(cookieParser());

const stripe = require("stripe")(process.env.STRIPE_KEY);
const uuid = require("uuid").v4;

const payment = async (req, res) => {
    let charge, status, check;
    const { product, token, user, event } = req.body;
    const key = uuid();

    try {
        const customer = await stripe.customers.create({
            email: token.email,
            source: token.id,
        });

        charge = await stripe.charges.create(
            {
                amount: product.price * 100,
                currency: "INR",
                customer: customer.id,
                receipt_email: token.email,
                description: `Booked Ticket for ${product.name}`,
                shipping: {
                    name: token.billing_name,
                    address: {
                        line1: token.shipping_address_line1,
                        line2: token.shipping_address_line2,
                        city: token.shipping_address_city,
                        country: token.shipping_address_country,
                        postal_code: token.shipping_address_zip,
                    },
                },
            },
            {
                idempotencyKey: key,
            }
        );

        console.log("Charge: ", charge);
        status = "success";
    } catch (error) {
        console.error("Stripe Error:", error);
        status = "failure";
        return res.status(500).send({ status });
    }

    try {
        const userDoc = await User.findOne({ user_token: user.user_id });
        if (!userDoc) {
            status = "error";
            return res.status(401).send({ msg: "User is unauthorized" });
        }

        const eventDoc = await Event.findOne({ event_id: event.event_id, "participants.id": user.user_id });
        if (eventDoc) {
            check = "alreadyregistered";
            console.log("Element already exists in array");
        } else {
            await Event.updateOne(
                { event_id: event.event_id },
                {
                    $push: {
                        participants: {
                            id: user.user_id,
                            name: userDoc.username,
                            email: userDoc.email,
                            passID: key,
                            regno: userDoc.reg_number,
                            entry: false,
                        },
                    },
                }
            );

            const Details = {
                email: userDoc.email,
                event_name: product.name,
                name: token.billing_name,
                pass: key,
                price: product.price,
                address1: token.shipping_address_line1,
                city: token.shipping_address_city,
                zip: token.shipping_address_zip,
            };

            console.log("All details before email: ", Details);
            sendTicket(Details);
        }

        await User.updateOne(
            { user_token: user.user_id },
            { $push: { registeredEvents: eventDoc } }
        );

        res.send({ status });
    } catch (err) {
        console.error("Database Error:", err);
        status = "failure";
        res.status(500).send({ status });
    }
};

module.exports = {
    payment,
};
