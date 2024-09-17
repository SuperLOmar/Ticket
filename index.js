const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionsBitField, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');

// Constants
const TOKEN = 'YOUR_BOT_TOKEN';
const TICKET_CATEGORY_ID = 'YOUR_CATEGORY_ID';
const SUPPORT_ROLE_ID = 'YOUR_SUPPORT_ROLE_ID';
const LOG_CHANNEL_ID = 'YOUR_LOG_CHANNEL_ID';
const TICKETS_FILE = path.join(__dirname, 'tickets.json');
const AUTO_MESSAGE_INTERVAL = 1000 * 60 * 60; // 1 hour
const FAQ_CHANNEL_ID = 'YOUR_FAQ_CHANNEL_ID'; // Channel for FAQs

const LANGUAGES = {
    en: {
        welcome: 'Click the button below to create a support ticket.',
        ticketCreated: 'Your ticket has been created!',
        ticketClosed: 'This ticket has been closed.',
        reminder: 'Reminder: Please review your tickets!',
        feedbackRequest: 'Please provide feedback on your ticket closure:',
        feedbackReceived: 'Thank you for your feedback!',
        prioritySet: 'Priority has been set to {priority}.',
        ticketAssigned: 'Your ticket has been assigned to {agent}.',
        ticketUpdated: 'Ticket has been updated with status: {status}.',
        reopenTicket: 'Your ticket has been reopened.',
        multiStep: 'Your ticket has entered the next step of the resolution process.',
    },
    // Add other languages here
};

const PRIORITIES = ['Low', 'Medium', 'High'];

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// Read and write JSON files
const readFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(filePath));
};

const writeFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Log ticket interactions
const logInteraction = async (interaction, message) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        await logChannel.send({
            embeds: [new EmbedBuilder()
                .setTitle('Ticket Interaction')
                .setDescription(message)
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>` },
                    { name: 'Channel', value: interaction.channel.name },
                )
                .setColor('#FF0000')
            ],
        });
    }
};

// Bot Ready Event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Initialize the support channel with a ticket creation button
    const supportChannel = client.channels.cache.get('YOUR_CHANNEL_ID');
    const embed = new EmbedBuilder()
        .setTitle('Support Ticket System')
        .setDescription(LANGUAGES.en.welcome)
        .setColor('#00AAFF');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Primary),
        );

    await supportChannel.send({
        embeds: [embed],
        components: [row],
    });

    // Auto-sending messages
    const autoMessages = [
        { channelId: 'YOUR_CHANNEL_ID', message: LANGUAGES.en.reminder }
    ];

    for (const { channelId, message } of autoMessages) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            setInterval(() => {
                channel.send(message);
            }, AUTO_MESSAGE_INTERVAL);
        }
    }
});

// Interaction Create Event
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'create_ticket') {
        // Create a new ticket channel
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: SUPPORT_ROLE_ID,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        // Save ticket info to JSON file
        const tickets = readFile(TICKETS_FILE);
        tickets[ticketChannel.id] = {
            ownerId: interaction.user.id,
            createdAt: new Date().toISOString(),
            status: 'open',
            priority: 'Medium',
            assignedTo: null,
            steps: [],
        };
        writeFile(TICKETS_FILE, tickets);

        const ticketEmbed = new EmbedBuilder()
            .setTitle(LANGUAGES.en.ticketCreated)
            .setDescription(`Ticket ID: ${ticketChannel.id}\nCreated At: ${new Date().toLocaleString()}`)
            .setColor('#00AAFF');

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('set_priority')
                    .setLabel('Set Priority')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('assign_ticket')
                    .setLabel('Assign Ticket')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('reopen_ticket')
                    .setLabel('Reopen Ticket')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('next_step')
                    .setLabel('Next Step')
                    .setStyle(ButtonStyle.Primary),
            );

        await ticketChannel.send({
            content: `<@&${SUPPORT_ROLE_ID}>`,
            embeds: [ticketEmbed],
            components: [actionRow],
        });

        await interaction.reply({
            content: `Your ticket channel has been created: ${ticketChannel}`,
            ephemeral: true,
        });

        logInteraction(interaction, `Ticket created by <@${interaction.user.id}> in ${ticketChannel}`);
    }

    if (interaction.customId === 'close_ticket') {
        const ticketChannel = interaction.channel;

        // Update ticket status in JSON file
        const tickets = readFile(TICKETS_FILE);
        if (tickets[ticketChannel.id]) {
            tickets[ticketChannel.id].status = 'closed';
            tickets[ticketChannel.id].closedAt = new Date().toISOString();
            writeFile(TICKETS_FILE, tickets);
        }

        await ticketChannel.send(LANGUAGES.en.ticketClosed);

        const feedbackMessage = await ticketChannel.send({
            content: LANGUAGES.en.feedbackRequest,
        });

        const filter = response => response.author.id === interaction.user.id;
        const collector = feedbackMessage.channel.createMessageCollector({ filter, time: 60000 });

        collector.on('collect', async (msg) => {
            await msg.reply(LANGUAGES.en.feedbackReceived);
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await feedbackMessage.reply('Feedback collection time has ended.');
            }
        });

        setTimeout(async () => {
            await ticketChannel.delete();
        }, 5000);

        logInteraction(interaction, `Ticket closed by <@${interaction.user.id}> in ${ticketChannel}`);
    }

    if (interaction.customId === 'set_priority') {
        // Set ticket priority
        const ticketChannel = interaction.channel;
        const tickets = readFile(TICKETS_FILE);
        if (tickets[ticketChannel.id]) {
            const priority = await getPriority(interaction);
            tickets[ticketChannel.id].priority = priority;
            writeFile(TICKETS_FILE, tickets);
            await interaction.reply({
                content: LANGUAGES.en.prioritySet.replace('{priority}', priority),
                ephemeral: true,
            });
            logInteraction(interaction, `Priority set to ${priority} in ${ticketChannel}`);
        }
    }

    if (interaction.customId === 'assign_ticket') {
        // Assign ticket to a support agent
        const ticketChannel = interaction.channel;
        const tickets = readFile(TICKETS_FILE);
        if (tickets[ticketChannel.id]) {
            const assignedTo = await getSupportAgent(interaction);
            tickets[ticketChannel.id].assignedTo = assignedTo;
            writeFile(TICKETS_FILE, tickets);
            await interaction.reply({
                content: LANGUAGES.en.ticketAssigned.replace('{agent}', `<@${assignedTo}>`),
                ephemeral: true,
            });
            logInteraction(interaction, `Ticket assigned to <@${assignedTo}> in ${ticketChannel}`);
        }
    }

    if (interaction.customId === 'reopen_ticket') {
        // Reopen the ticket
        const ticketChannel = interaction.channel;
        const tickets = readFile(TICKETS_FILE);
        if (tickets[ticketChannel.id]) {
            tickets[ticketChannel.id].status = 'open';
            tickets[ticketChannel.id].closedAt = null;
            writeFile(TICKETS_FILE, tickets);
            await interaction.reply({
                content: LANGUAGES.en.reopenTicket,
                ephemeral: true,
            });
            logInteraction(interaction, `Ticket reopened in ${ticketChannel}`);
        }
    }

    if (interaction.customId === 'next_step') {
        // Move ticket to the next step
        const ticketChannel = interaction.channel;
        const tickets = readFile(TICKETS_FILE);
        if (tickets[ticketChannel.id]) {
            tickets[ticketChannel.id].steps.push(new Date().toISOString());
            writeFile(TICKETS_FILE, tickets);
            await interaction.reply({
                content: LANGUAGES.en.multiStep,
                ephemeral: true,
            });
            logInteraction(interaction, `Ticket moved to next step in ${ticketChannel}`);
        }
    }
});

// Utility Functions
const getPriority = async (interaction) => {
    // Implement priority selection logic
    // This could involve sending a message with options to the user
    // and collecting their response.
    return 'Medium'; // Placeholder
};

const getSupportAgent = async (interaction) => {
    // Implement support agent selection logic
    // This could involve sending a message with options to the user
    // and collecting their response.
    return interaction.guild.members.cache.find(member => member.hasPermission(PermissionsBitField.Flags.ManageMessages)).id; // Placeholder
};

// Auto-Responses
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const triggerWords = ['help', 'issue']; // Add trigger words as needed

    for (const word of triggerWords) {
        if (message.content.toLowerCase().includes(word)) {
            await message.reply('It looks like you need help! Please create a ticket using the button below.');
            break;
        }
    }
});

// FAQ Integration
client.on('messageCreate', async (message) => {
    if (message.channel.id === FAQ_CHANNEL_ID) {
        // Implement FAQ response logic here
        // For example, respond with predefined answers to common questions
    }
});

// Express Web Dashboard
const app = express();
app.use(bodyParser.json());

app.get('/dashboard', (req, res) => {
    res.send('This is your web dashboard.');
    // Implement more dashboard functionality as needed
});

const server = http.createServer(app);
server.listen(3000, () => {
    console.log('Web server running on port 3000');
});

// Error Handling
client.on('error', console.error);

client.login(TOKEN);
