@citi @browser @recovery
Feature: Explain and recover from blocked Citi saved offers
  An available-offer count must not hide the reason adding is blocked.
  Unknown outcomes require explicit verification and must never auto-retry.

  Background:
    Given a synthetic Citi page with the published userscript
    And I loaded offers and selected only card A

  Scenario: A count of 275 available offers still explains an unconfirmed blocker
    Given Citi has 276 available offers
    And Citi will return an unconfirmed enrollment response
    When I click "Refresh & add offers"
    And the operation reports "not explicitly confirmed"
    Then the saved-offers button shows 275 available offers
    And the "Add saved offers" button is disabled
    And the disabled-action explanation contains "1 saved offer(s) have an unconfirmed add result"

  Scenario: An unconfirmed result remains explained after a page reload
    Given Citi will return an unconfirmed enrollment response
    When I click "Add saved offers"
    And the operation reports "not explicitly confirmed"
    And I reload the page
    Then the "Add saved offers" button is disabled
    And the disabled-action explanation contains "1 saved offer(s) have an unconfirmed add result"
    And the "Refresh & add offers" button is enabled
    When one minute passes without a click
    Then no new Citi requests have been sent
    And exactly 1 enrollment request has been sent

  Scenario: Explicit refresh resolves an unknown success without replaying it
    Given Citi will return an unconfirmed enrollment response
    When I click "Add saved offers"
    And the operation reports "not explicitly confirmed"
    Given Citi confirms that offer "a" on card A is already enrolled
    When I click "Refresh & add offers"
    And the operation reports "Finished: 1/1"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |

  Scenario: A rate limit disables both actions and never retries by itself
    Given Citi will rate limit enrollment requests
    When I click "Add saved offers"
    And the operation reports "HTTP 429"
    Then the "Add saved offers" button is disabled
    And the "Refresh & add offers" button is disabled
    And the disabled-action explanation contains "cooldown"
    When I reload the page
    And one minute passes without a click
    Then no new Citi requests have been sent
    And the "Add saved offers" button is disabled
    And the "Refresh & add offers" button is disabled
    And exactly 1 enrollment request has been sent
