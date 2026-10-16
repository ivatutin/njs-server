import { ContactChangeNotifierAdapter } from '../../../src/modules/otp/application/services/contact-change-notifier.adapter';
import { EmailSender } from '../../../src/modules/otp/domain/ports/email-sender.port';
import { SmsSender } from '../../../src/modules/otp/domain/ports/sms-sender.port';

const KC_ID = 'f5c78c0c-0d91-49e8-bd4e-d3c02295ddcf';

describe('ContactChangeNotifierAdapter (ADR-0017 §6)', () => {
  let sms: jest.Mocked<SmsSender>;
  let email: jest.Mocked<EmailSender>;
  let notifier: ContactChangeNotifierAdapter;

  beforeEach(() => {
    sms = { send: jest.fn(), sendText: jest.fn() } as unknown as jest.Mocked<SmsSender>;
    email = {
      send: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ accepted: true }),
    } as unknown as jest.Mocked<EmailSender>;

    notifier = new ContactChangeNotifierAdapter(sms, email);
  });

  it('телефон: уведомляем и новый, и прежний контакт', async () => {
    await notifier.notifyChanged({
      keycloakId: KC_ID,
      channel: 'phone',
      newValue: '+79990000124',
      oldValue: '+79990000106',
    });

    expect(sms.sendText).toHaveBeenNthCalledWith(1, {
      target: '+79990000124',
      text: expect.stringContaining('изменён'),
    });
    expect(sms.sendText).toHaveBeenNthCalledWith(2, {
      target: '+79990000106',
      text: expect.stringContaining('изменён'),
    });
    expect(email.sendMessage).not.toHaveBeenCalled();
  });

  it('email: служебное письмо без кода и без данных аккаунта', async () => {
    await notifier.notifyChanged({
      keycloakId: KC_ID,
      channel: 'email',
      newValue: 'new@example.com',
      oldValue: null,
    });

    expect(email.sendMessage).toHaveBeenCalledTimes(1);
    expect(email.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'new@example.com',
        subject: 'Контакт изменён',
        messageId: expect.stringContaining('contact-change-new'),
      }),
    );
    expect(sms.sendText).not.toHaveBeenCalled();
  });

  it('без прежнего контакта уведомление одно', async () => {
    await notifier.notifyChanged({
      keycloakId: KC_ID,
      channel: 'phone',
      newValue: '+79990000124',
      oldValue: null,
    });

    expect(sms.sendText).toHaveBeenCalledTimes(1);
  });

  it('best-effort: падение канала не поднимается вызывающему', async () => {
    sms.sendText.mockRejectedValue(new Error('sms gateway down'));

    await expect(
      notifier.notifyChanged({
        keycloakId: KC_ID,
        channel: 'phone',
        newValue: '+79990000124',
        oldValue: '+79990000106',
      }),
    ).resolves.toBeUndefined();
  });

  it('best-effort: отказ провайдера письма тоже не поднимается', async () => {
    email.sendMessage.mockResolvedValue({ accepted: false, reason: 'not-configured' });

    await expect(
      notifier.notifyChanged({
        keycloakId: KC_ID,
        channel: 'email',
        newValue: 'new@example.com',
        oldValue: null,
      }),
    ).resolves.toBeUndefined();
  });
});
